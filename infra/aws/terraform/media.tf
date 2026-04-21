# User-uploaded media (avatars, banners, conversation attachments): S3 + CloudFront.
#
# Private S3 bucket with two key prefixes:
#   - uploads/   : raw files uploaded via presigned PUT URLs (never served publicly)
#   - processed/ : Lambda-processed files (EXIF stripped, resized, moderated) served via CloudFront
#
# Conversation media uses a dual-upload approach for E2E privacy with content moderation:
#   1. E2E encrypted media goes to a separate bucket (aws_s3_bucket.e2e_media) — no Lambda, no CDN
#   2. A cleartext thumbnail (scan copy) goes to uploads/conv_scan/ in this bucket for Rekognition.
#      The media-processor deletes the raw object after moderation and does not retain processed/
#      assets for conv_scan. The expire-stale-uploads rule (uploads/) and
#      expire-conv-scan-processed-legacy (processed/conv_scan/) are safety nets for stragglers.
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

  # Legacy processed WebP objects from older conv_scan pipeline (or failed deletes).
  rule {
    id     = "expire-conv-scan-processed-legacy"
    status = "Enabled"

    filter {
      prefix = "processed/conv_scan/"
    }

    expiration {
      days = 14
    }

    noncurrent_version_expiration {
      noncurrent_days = 14
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  cors_rule {
    allowed_headers = ["*"]
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
          Sid    = "SQSConsume"
          Effect = "Allow"
          Action = [
            "sqs:ReceiveMessage",
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
          ]
          Resource = aws_sqs_queue.media_uploads[0].arn
        },
        {
          Sid    = "InvokeDbWriter"
          Effect = "Allow"
          Action = [
            "lambda:InvokeFunction",
          ]
          Resource = aws_lambda_function.media_db_writer[0].arn
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
            "rekognition:StartContentModeration",
          ]
          Resource = "*"
        },
      ] : [],
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
        MEDIA_BUCKET            = aws_s3_bucket.media[0].id
        CONTENT_MODERATION      = var.enable_media_content_moderation ? "true" : "false"
        MODERATION_CONFIDENCE   = tostring(var.media_moderation_confidence_threshold)
        DB_WRITER_FUNCTION_NAME = aws_lambda_function.media_db_writer[0].function_name
      },
      local.media_enabled && var.enable_media_content_moderation ? {
        REKOGNITION_NOTIFICATION_ROLE_ARN = aws_iam_role.rekognition_video_sns_publish[0].arn
        REKOGNITION_NOTIFICATION_SNS_TOPIC_ARN = aws_sns_topic.rekognition_video_moderation[0].arn
      } : {},
    )
  }

  tags = local.common_tags

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# ---------------------------------------------------------------------------
# Lambda: media DB writer (updates media_uploads in MongoDB Atlas)
#
# Runs inside the VPC to reach Atlas via VPC peering. The media processor
# Lambda invokes this synchronously after processing. This Lambda has NO
# S3 access — only Secrets Manager (for the MongoDB URI) and MongoDB.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "media_db_writer" {
  count = local.media_enabled ? 1 : 0

  name = "${local.name_prefix}-media-db-writer"

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

resource "aws_iam_role_policy" "media_db_writer" {
  count = local.media_enabled ? 1 : 0

  name = "media-db-writer"
  role = aws_iam_role.media_db_writer[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid    = "SecretsManagerRead"
          Effect = "Allow"
          Action = [
            "secretsmanager:GetSecretValue",
          ]
          Resource = var.media_db_mongodb_secret_arn
        },
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
      length(trimspace(var.media_db_mongodb_secret_kms_key_arn)) > 0 ? [
        {
          Sid    = "KMSDecrypt"
          Effect = "Allow"
          Action = [
            "kms:Decrypt",
          ]
          Resource = var.media_db_mongodb_secret_kms_key_arn
        },
      ] : [],
    )
  })
}

resource "aws_lambda_function" "media_db_writer" {
  count = local.media_enabled ? 1 : 0

  function_name = "${local.name_prefix}-media-db-writer"
  role          = aws_iam_role.media_db_writer[0].arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 15
  memory_size   = 256

  filename         = "${path.module}/../lambda/media-db-writer/dist/function.zip"
  source_code_hash = fileexists("${path.module}/../lambda/media-db-writer/dist/function.zip") ? filebase64sha256("${path.module}/../lambda/media-db-writer/dist/function.zip") : null

  environment {
    variables = {
      MONGODB_SECRET_ARN = var.media_db_mongodb_secret_arn
      MONGODB_SECRET_KEY = var.media_db_mongodb_secret_key
      MONGODB_DB_NAME    = var.media_db_mongodb_db_name
      MEDIA_CDN_URL      = "https://${var.media_domain_name}"
    }
  }

  vpc_config {
    subnet_ids         = module.vpc.private_subnets
    security_group_ids = [aws_security_group.media_db_writer[0].id]
  }

  tags = local.common_tags

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_security_group" "media_db_writer" {
  count = local.media_enabled ? 1 : 0

  name_prefix = "${local.name_prefix}-media-dbw-"
  description = "Media DB writer Lambda (VPC, reaches Atlas via peering)"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-media-db-writer" })
}

# ---------------------------------------------------------------------------
# SQS: media upload processing queue + dead-letter queue
#
# S3 sends ObjectCreated events to SQS; Lambda polls the queue. This gives
# durable delivery, automatic retries, and a DLQ for events that fail
# repeatedly — preventing silent event loss during throttling or errors.
# ---------------------------------------------------------------------------

resource "aws_sqs_queue" "media_uploads_dlq" {
  count = local.media_enabled ? 1 : 0

  name                      = "${local.name_prefix}-media-uploads-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-media-uploads-dlq" })
}

resource "aws_sqs_queue" "media_uploads" {
  count = local.media_enabled ? 1 : 0

  name                       = "${local.name_prefix}-media-uploads"
  visibility_timeout_seconds = 360 # 6x Lambda timeout (60s) per AWS best practice
  message_retention_seconds  = 86400 # 1 day
  receive_wait_time_seconds  = 20 # long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.media_uploads_dlq[0].arn
    maxReceiveCount     = 3
  })

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-media-uploads" })
}

resource "aws_sqs_queue_policy" "media_uploads" {
  count = local.media_enabled ? 1 : 0

  queue_url = aws_sqs_queue.media_uploads[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3SendMessage"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.media_uploads[0].arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_s3_bucket.media[0].arn
          }
        }
      },
    ]
  })
}

resource "aws_s3_bucket_notification" "media_uploads" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  queue {
    queue_arn     = aws_sqs_queue.media_uploads[0].arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
  }

  depends_on = [aws_sqs_queue_policy.media_uploads]
}

resource "aws_lambda_event_source_mapping" "media_uploads" {
  count = local.media_enabled ? 1 : 0

  event_source_arn                   = aws_sqs_queue.media_uploads[0].arn
  function_name                      = aws_lambda_function.media_processor[0].arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 0
  enabled                            = true
}

# ---------------------------------------------------------------------------
# Rekognition Video: SNS topic + async completion Lambda
#
# Topic name must start with "AmazonRekognition" (Rekognition service requirement).
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "rekognition_video_moderation" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  name = "AmazonRekognition-${local.name_prefix}-user-video-moderation"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-rekognition-video-moderation" })
}

resource "aws_iam_role" "rekognition_video_sns_publish" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  name = "${local.name_prefix}-rekognition-sns-publish-video"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "rekognition.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      },
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "rekognition_video_sns_publish" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  name = "rekognition-sns-publish"
  role = aws_iam_role.rekognition_video_sns_publish[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sns:Publish",
        ]
        Resource = aws_sns_topic.rekognition_video_moderation[0].arn
      },
    ]
  })
}

resource "aws_iam_role" "media_video_moderation_complete" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  name = "${local.name_prefix}-media-video-moderation-complete"

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

resource "aws_iam_role_policy" "media_video_moderation_complete" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  name = "media-video-moderation-complete"
  role = aws_iam_role.media_video_moderation_complete[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RekognitionReadResults"
        Effect = "Allow"
        Action = [
          "rekognition:GetContentModeration",
        ]
        Resource = "*"
      },
      {
        Sid    = "S3DeleteScanUpload"
        Effect = "Allow"
        Action = [
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.media[0].arn}/uploads/conv_scan/*"
      },
      {
        Sid    = "InvokeDbWriter"
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction",
        ]
        Resource = aws_lambda_function.media_db_writer[0].arn
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
    ]
  })
}

resource "aws_lambda_function" "media_video_moderation_complete" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  function_name = "${local.name_prefix}-media-video-moderation-complete"
  role          = aws_iam_role.media_video_moderation_complete[0].arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 120
  memory_size   = 512

  filename         = "${path.module}/../lambda/media-video-moderation-complete/dist/function.zip"
  source_code_hash = fileexists("${path.module}/../lambda/media-video-moderation-complete/dist/function.zip") ? filebase64sha256("${path.module}/../lambda/media-video-moderation-complete/dist/function.zip") : null

  reserved_concurrent_executions = var.media_video_completion_lambda_reserved_concurrency

  environment {
    variables = {
      MEDIA_BUCKET            = aws_s3_bucket.media[0].id
      MODERATION_CONFIDENCE   = tostring(var.media_moderation_confidence_threshold)
      DB_WRITER_FUNCTION_NAME = aws_lambda_function.media_db_writer[0].function_name
    }
  }

  tags = local.common_tags

  depends_on = [
    aws_iam_role_policy.media_video_moderation_complete[0],
  ]

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_permission" "media_video_moderation_sns" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.media_video_moderation_complete[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.rekognition_video_moderation[0].arn
}

resource "aws_sns_topic_subscription" "rekognition_video_to_lambda" {
  count = local.media_enabled && var.enable_media_content_moderation ? 1 : 0

  topic_arn = aws_sns_topic.rekognition_video_moderation[0].arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.media_video_moderation_complete[0].arn

  depends_on = [
    aws_lambda_permission.media_video_moderation_sns,
  ]
}

# ---------------------------------------------------------------------------
# E2E media bucket (conversation attachments, encrypted client-side)
#
# Stores E2E encrypted media blobs uploaded via presigned PUT. Clients fetch
# via presigned GET and decrypt locally. No Lambda processing, no CloudFront.
# Access is gated server-side: presigned GETs are only issued after the
# companion scan copy passes Rekognition moderation.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "e2e_media" {
  count = local.media_enabled ? 1 : 0

  bucket = "${local.name_prefix}-e2e-media-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-e2e-media" })
}

resource "aws_s3_bucket_public_access_block" "e2e_media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.e2e_media[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "e2e_media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.e2e_media[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "e2e_media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.e2e_media[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "e2e_media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.e2e_media[0].id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # Confirmed E2E media lives until the host message is deleted (the API
  # calls DeleteObjectCommand at that point).  Noncurrent versions are
  # cleaned up after 7 days so versioning doesn't accumulate indefinitely.
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "e2e_media" {
  count = local.media_enabled ? 1 : 0

  bucket = aws_s3_bucket.e2e_media[0].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET"]
    allowed_origins = local.media_cors_origins
    max_age_seconds = 3600
  }
}

# ECS task role: S3 permissions for the E2E media bucket (presigned PUT/GET + cleanup)
resource "aws_iam_role_policy" "ecs_task_e2e_media" {
  count = local.media_enabled ? 1 : 0

  name = "${local.name_prefix}-ecs-task-e2e-media"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "E2EMediaUploads"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
        ]
        Resource = "${aws_s3_bucket.e2e_media[0].arn}/uploads/*"
      },
      {
        Sid    = "E2EMediaRead"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.e2e_media[0].arn}/*"
      },
    ]
  })
}
