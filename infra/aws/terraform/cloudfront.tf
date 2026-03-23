# Static web (apps/web build output). app.<domain> is a Route53 alias to this distribution.

resource "aws_s3_bucket" "web" {
  count = local.public_dns_tls_enabled ? 1 : 0

  bucket = "${local.name_prefix}-web-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-web" })
}

resource "aws_s3_bucket_public_access_block" "web" {
  count = local.public_dns_tls_enabled ? 1 : 0

  bucket = aws_s3_bucket.web[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
  count = local.public_dns_tls_enabled ? 1 : 0

  name                              = "${local.name_prefix}-web-oac"
  description                       = "OAC for ${local.name_prefix} web bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "web" {
  count = local.public_dns_tls_enabled ? 1 : 0

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Web app ${local.name_prefix}"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [var.app_domain_name]

  # PAYG + enable_waf: Terraform-managed CLOUDFRONT WAF. Flat-rate: plan-managed WAF (set cloudfront_pricing_plan_web_acl_arn after console subscribe).
  web_acl_id = local.cdn_waf_from_terraform ? aws_wafv2_web_acl.cdn[0].arn : (
    trimspace(var.cloudfront_pricing_plan_web_acl_arn) != "" ? var.cloudfront_pricing_plan_web_acl_arn : null
  )

  origin {
    domain_name              = aws_s3_bucket.web[0].bucket_regional_domain_name
    origin_id                = "s3-web"
    origin_access_control_id = aws_cloudfront_origin_access_control.web[0].id
  }

  default_cache_behavior {
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "s3-web"
    compress                 = true
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # Managed-CORS-S3Origin
  }

  # SPA: serve index.html for client-side routes when the object key is missing.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.cloudfront]

  lifecycle {
    precondition {
      condition = (
        !local.public_dns_tls_enabled ||
        !local.public_ingress_restricted ||
        var.enable_waf ||
        local.cloudfront_flat_rate_enabled
      )
      error_message = "A restricted public_allowed_cidr_blocks list applies to CloudFront: set enable_waf=true so Terraform can attach WAF IP allowlist rules (PAYG), or use a flat-rate CloudFront plan and add the same CIDRs to the plan-managed CloudFront WAF in the AWS console."
    }
  }

  tags = merge(local.common_tags, {
    CloudFrontPricingModel = var.cloudfront_pricing_model
  })
}

data "aws_iam_policy_document" "web_bucket" {
  count = local.public_dns_tls_enabled ? 1 : 0

  statement {
    sid    = "AllowCloudFrontServiceRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web[0].arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  count = local.public_dns_tls_enabled ? 1 : 0

  bucket = aws_s3_bucket.web[0].id
  policy = data.aws_iam_policy_document.web_bucket[0].json

  depends_on = [
    aws_s3_bucket_public_access_block.web,
    aws_cloudfront_distribution.web,
  ]
}
