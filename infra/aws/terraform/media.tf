# User-uploaded media (avatars, banners, conversation attachments): S3 + CloudFront.
#
# Private S3 bucket with two key prefixes:
#   - uploads/   : raw files uploaded via presigned PUT URLs (never served publicly)
#   - processed/ : Lambda-processed files (EXIF stripped, resized, moderated) served via CloudFront
#
# Gated on enable_media_stack (requires public_dns_tls_enabled).

# ---------------------------------------------------------------------------
# Media bucket
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "media" {
  count = local.media_enabled ? 1 : 0

  bucket = "${local.name_prefix}-media-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-media" })
}

resource "aws_s3_bucket_public_access_block" "media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  rule {
    id     = "expire-stale-uploads"
    status = "Enabled"

    filter {
      prefix = "uploads/"
    }

    expiration {
      days = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  cors_rule {
    allowed_headers = ["Content-Type", "Content-Length", "x-amz-content-sha256"]
    allowed_methods = ["PUT"]
    allowed_origins = local.media_cors_origins
    max_age_seconds = 3600
  }
}

# ---------------------------------------------------------------------------
# OAC for media bucket (CloudFront -> S3)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "media" {
  count = local.media_enabled ? 1 : 0

  name                              = "${local.name_prefix}-media-oac"
  description                       = "OAC for ${local.name_prefix} media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------------------
# ACM certificate for media hostname (us-east-1, CloudFront requirement)
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "media" {
  count = local.media_enabled ? 1 : 0

  provider = aws.us_east_1

  domain_name       = var.media_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_route53_record" "cert_validation_media" {
  for_each = local.media_enabled ? {
    for dvo in aws_acm_certificate.media[0].domain_validation_options : dvo.domain_name => {
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

resource "aws_acm_certificate_validation" "media" {
  count = local.media_enabled ? 1 : 0

  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.media[0].arn
  validation_record_fqdns = [
    for r in aws_route53_record.cert_validation_media : r.fqdn
  ]
}

# ---------------------------------------------------------------------------
# CloudFront distribution (serves only processed/ prefix)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "media" {
  count = local.media_enabled ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "Media CDN ${local.name_prefix}"
  price_class     = "PriceClass_100"
  aliases         = [var.media_domain_name]

  origin {
    domain_name              = aws_s3_bucket.media[0].bucket_regional_domain_name
    origin_id                = "s3-media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media[0].id
    origin_path              = "/processed"
  }

  default_cache_behavior {
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "s3-media"
    compress                 = true
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # Managed-CORS-S3Origin
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.media[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.media]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-media"
  })
}

# ---------------------------------------------------------------------------
# Bucket policy: CloudFront OAC may read processed/* only
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "media_bucket" {
  count = local.media_enabled ? 1 : 0

  statement {
    sid    = "AllowCloudFrontServiceRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media[0].arn}/processed/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id
  policy = data.aws_iam_policy_document.media_bucket[0].json

  depends_on = [
    aws_s3_bucket_public_access_block.media,
    aws_cloudfront_distribution.media,
  ]
}

# ---------------------------------------------------------------------------
# Route53 alias: media.<domain> -> CloudFront
# ---------------------------------------------------------------------------

resource "aws_route53_record" "media_alias" {
  count = local.media_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = local.media_route53_record_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.media[0].domain_name
    zone_id                = aws_cloudfront_distribution.media[0].hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [aws_cloudfront_distribution.media]
}

# ---------------------------------------------------------------------------
# ECS task role: S3 permissions for presigned URL generation + media management
# ---------------------------------------------------------------------------

resource "aws_iam_role_policy" "ecs_task_media" {
  count = local.media_enabled ? 1 : 0

  name = "${local.name_prefix}-ecs-task-media"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "MediaUploads"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.media[0].arn}/uploads/*"
      },
      {
        Sid    = "MediaProcessed"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.media[0].arn}/processed/*"
      },
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda layer: sharp (image processing native binaries for linux-x64)
# ---------------------------------------------------------------------------

resource "aws_lambda_layer_version" "sharp" {
  count = local.media_enabled ? 1 : 0

  layer_name          = "${local.name_prefix}-sharp"
  description         = "sharp image processing library for nodejs20.x linux-x64"
  filename            = "${path.module}/../lambda/layers/sharp/sharp-layer.zip"
  source_code_hash    = fileexists("${path.module}/../lambda/layers/sharp/sharp-layer.zip") ? filebase64sha256("${path.module}/../lambda/layers/sharp/sharp-layer.zip") : null
  compatible_runtimes = ["nodejs20.x"]

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# ---------------------------------------------------------------------------
# Lambda: image processor (EXIF strip, resize, content moderation)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "media_processor" {
  count = local.media_enabled ? 1 : 0

  name = "${local.name_prefix}-media-processor"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "media_processor" {
  count = local.media_enabled ? 1 : 0

  name = "media-processor"
  role = aws_iam_role.media_processor[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid    = "S3ReadUploads"
          Effect = "Allow"
          Action = [
            "s3:GetObject",
            "s3:DeleteObject",
          ]
          Resource = "${aws_s3_bucket.media[0].arn}/uploads/*"
        },
        {
          Sid    = "S3WriteProcessed"
          Effect = "Allow"
          Action = [
            "s3:PutObject",
          ]
          Resource = "${aws_s3_bucket.media[0].arn}/processed/*"
        },
        {
          Sid    = "CloudWatchLogs"
          Effect = "Allow"
          Action = [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ]
          Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
        },
      ],
      var.enable_media_content_moderation ? [
        {
          Sid    = "RekognitionModeration"
          Effect = "Allow"
          Action = [
            "rekognition:DetectModerationLabels",
          ]
          Resource = "*"
        },
      ] : [],
      local.media_lambda_vpc_enabled ? [
        {
          Sid    = "VPCNetworkInterface"
          Effect = "Allow"
          Action = [
            "ec2:CreateNetworkInterface",
            "ec2:DescribeNetworkInterfaces",
            "ec2:DeleteNetworkInterface",
          ]
          Resource = "*"
        },
      ] : []
    )
  })
}

resource "aws_lambda_function" "media_processor" {
  count = local.media_enabled ? 1 : 0

  function_name = "${local.name_prefix}-media-processor"
  role          = aws_iam_role.media_processor[0].arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 1024

  filename         = "${path.module}/../lambda/media-processor/dist/function.zip"
  source_code_hash = fileexists("${path.module}/../lambda/media-processor/dist/function.zip") ? filebase64sha256("${path.module}/../lambda/media-processor/dist/function.zip") : null

  layers = [aws_lambda_layer_version.sharp[0].arn]

  environment {
    variables = merge(
      {
        MEDIA_BUCKET          = aws_s3_bucket.media[0].id
        CONTENT_MODERATION    = var.enable_media_content_moderation ? "true" : "false"
        MODERATION_CONFIDENCE = tostring(var.media_moderation_confidence_threshold)
        API_CALLBACK_URL      = local.media_api_callback_url
        PROCESSOR_SECRET      = var.media_processor_secret
      },
    )
  }

  dynamic "vpc_config" {
    for_each = local.media_lambda_vpc_enabled ? [1] : []
    content {
      subnet_ids         = module.vpc.private_subnets
      security_group_ids = [aws_security_group.media_processor[0].id]
    }
  }

  tags = local.common_tags

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_security_group" "media_processor" {
  count = local.media_lambda_vpc_enabled ? 1 : 0

  name_prefix = "${local.name_prefix}-media-proc-"
  description = "Media processor Lambda"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-media-processor" })
}

resource "aws_lambda_permission" "media_s3_invoke" {
  count = local.media_enabled ? 1 : 0

  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.media_processor[0].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.media[0].arn
}

resource "aws_s3_bucket_notification" "media_uploads" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  lambda_function {
    lambda_function_arn = aws_lambda_function.media_processor[0].arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
  }

  depends_on = [aws_lambda_permission.media_s3_invoke]
}
