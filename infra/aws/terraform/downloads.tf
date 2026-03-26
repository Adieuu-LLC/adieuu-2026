# Desktop update mirror and public downloads: S3 + CloudFront (downloads.<domain>).
#
# Dual-origin CloudFront distribution:
#   - S3 origin (default): binaries, SBOMs, releases.json (via OAC)
#   - ALB origin (ordered): release manifests (latest*.yml) served by the API
#     from a dedicated private S3 bucket (trust boundary separation)
#
# Gated on enable_downloads_stack (requires public_dns_tls_enabled).

# ---------------------------------------------------------------------------
# Downloads bucket (binaries, SBOMs, releases.json)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "downloads" {
  count = local.downloads_enabled ? 1 : 0

  bucket = "${local.name_prefix}-downloads-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-downloads" })
}

resource "aws_s3_bucket_public_access_block" "downloads" {
  count = local.downloads_enabled ? 1 : 0

  bucket = aws_s3_bucket.downloads[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Release manifests bucket (private; latest*.yml with sha512 checksums)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "release_manifests" {
  count = local.downloads_enabled ? 1 : 0

  bucket = "${local.name_prefix}-release-manifests-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-release-manifests" })
}

resource "aws_s3_bucket_public_access_block" "release_manifests" {
  count = local.downloads_enabled ? 1 : 0

  bucket = aws_s3_bucket.release_manifests[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# OAC for downloads bucket (CloudFront -> S3)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "downloads" {
  count = local.downloads_enabled ? 1 : 0

  name                              = "${local.name_prefix}-downloads-oac"
  description                       = "OAC for ${local.name_prefix} downloads bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------------------
# ACM certificate for downloads hostname (us-east-1, CloudFront requirement)
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "downloads" {
  count = local.downloads_enabled ? 1 : 0

  provider = aws.us_east_1

  domain_name       = var.downloads_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_route53_record" "cert_validation_downloads" {
  for_each = local.downloads_enabled ? {
    for dvo in aws_acm_certificate.downloads[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.public[0].zone_id
}

resource "aws_acm_certificate_validation" "downloads" {
  count = local.downloads_enabled ? 1 : 0

  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.downloads[0].arn
  validation_record_fqdns = [
    for r in aws_route53_record.cert_validation_downloads : r.fqdn
  ]
}

# ---------------------------------------------------------------------------
# Custom cache policy: short TTL for manifest path (API origin)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_cache_policy" "downloads_manifests" {
  count = local.downloads_enabled ? 1 : 0

  name        = "${local.name_prefix}-downloads-manifests"
  comment     = "Short TTL for release manifests (latest*.yml via API)"
  default_ttl = 60
  max_ttl     = 300
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# ---------------------------------------------------------------------------
# CloudFront distribution (dual-origin: S3 binaries + ALB manifests)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "downloads" {
  count = local.downloads_enabled ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "Downloads mirror ${local.name_prefix}"
  price_class     = "PriceClass_100"
  aliases         = [var.downloads_domain_name]

  # S3 origin: binaries, SBOMs, releases.json.
  origin {
    domain_name              = aws_s3_bucket.downloads[0].bucket_regional_domain_name
    origin_id                = "s3-downloads"
    origin_access_control_id = aws_cloudfront_origin_access_control.downloads[0].id
  }

  # ALB origin: release manifests served by the API (reads from private bucket).
  # origin_path maps CloudFront path latest/latest*.yml -> ALB /api/v1/releases/latest/latest*.yml
  origin {
    domain_name = var.api_domain_name
    origin_id   = "alb-api-manifests"
    origin_path = "/api/v1/releases"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Ordered behavior: manifest yml files -> API via ALB.
  ordered_cache_behavior {
    path_pattern           = "latest/latest*.yml"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb-api-manifests"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = aws_cloudfront_cache_policy.downloads_manifests[0].id
  }

  # Default behavior: binaries, SBOMs, releases.json -> S3.
  default_cache_behavior {
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "s3-downloads"
    compress                 = true
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # Managed-CORS-S3Origin
  }

  # No SPA error responses: 403/404 should return actual errors for missing objects.

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.downloads[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.downloads]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-downloads"
  })
}

# ---------------------------------------------------------------------------
# Bucket policies
# ---------------------------------------------------------------------------

# Downloads bucket: only CloudFront (via OAC) may read.
data "aws_iam_policy_document" "downloads_bucket" {
  count = local.downloads_enabled ? 1 : 0

  statement {
    sid    = "AllowCloudFrontServiceRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.downloads[0].arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.downloads[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "downloads" {
  count = local.downloads_enabled ? 1 : 0

  bucket = aws_s3_bucket.downloads[0].id
  policy = data.aws_iam_policy_document.downloads_bucket[0].json

  depends_on = [
    aws_s3_bucket_public_access_block.downloads,
    aws_cloudfront_distribution.downloads,
  ]
}

# ---------------------------------------------------------------------------
# Route53 alias: downloads.<domain> -> CloudFront
# ---------------------------------------------------------------------------

resource "aws_route53_record" "downloads_alias" {
  count = local.downloads_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.downloads_route53_record_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.downloads[0].domain_name
    zone_id                = aws_cloudfront_distribution.downloads[0].hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [aws_cloudfront_distribution.downloads]
}
