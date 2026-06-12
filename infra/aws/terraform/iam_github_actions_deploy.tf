# GitHub OIDC: one provider per AWS account (URL token.actions.githubusercontent.com).
# By default we create it here; if it already exists, set var.github_oidc_provider_arn instead of applying create.

resource "aws_iam_openid_connect_provider" "github" {
  count = var.enable_github_actions_deploy_role && trimspace(var.github_oidc_provider_arn) == "" ? 1 : 0

  url = "https://token.actions.githubusercontent.com"
  client_id_list = [
    "sts.amazonaws.com",
  ]
  # GitHub docs: root + intermediate CA thumbprints (see GitHub OIDC + AWS IAM setup).
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  tags = local.common_tags
}

locals {
  github_oidc_provider_arn_for_deploy = var.enable_github_actions_deploy_role ? (
    trimspace(var.github_oidc_provider_arn) != "" ? trimspace(var.github_oidc_provider_arn) : aws_iam_openid_connect_provider.github[0].arn
  ) : null
}

resource "aws_iam_role" "github_actions_deploy" {
  count = var.enable_github_actions_deploy_role ? 1 : 0
  name  = "${local.name_prefix}-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = local.github_oidc_provider_arn_for_deploy
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_actions_repository}:ref:refs/heads/main"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

data "aws_iam_policy_document" "github_actions_deploy" {
  count = var.enable_github_actions_deploy_role ? 1 : 0

  statement {
    sid    = "EcrAuth"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPush"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [
      aws_ecr_repository.api.arn,
      aws_ecr_repository.chat.arn,
    ]
  }

  statement {
    sid    = "EcsDeploy"
    effect = "Allow"
    actions = [
      "ecs:UpdateService",
      "ecs:DescribeServices",
    ]
    resources = [
      "arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}",
      "arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:service/${aws_ecs_cluster.main.name}/${aws_ecs_service.chat.name}",
    ]
  }

  dynamic "statement" {
    for_each = local.public_dns_tls_enabled ? [1] : []
    content {
      sid    = "S3Web"
      effect = "Allow"
      actions = [
        "s3:ListBucket",
        "s3:GetBucketLocation",
      ]
      resources = [aws_s3_bucket.web[0].arn]
    }
  }

  dynamic "statement" {
    for_each = local.public_dns_tls_enabled ? [1] : []
    content {
      sid    = "S3WebObjects"
      effect = "Allow"
      actions = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
      ]
      resources = ["${aws_s3_bucket.web[0].arn}/*"]
    }
  }

  dynamic "statement" {
    for_each = local.public_dns_tls_enabled ? [1] : []
    content {
      sid    = "CloudFrontInvalidate"
      effect = "Allow"
      actions = [
        "cloudfront:CreateInvalidation",
      ]
      resources = [aws_cloudfront_distribution.web[0].arn]
    }
  }

  # --- Lambda code deploy (media stack) ---

  dynamic "statement" {
    for_each = local.media_enabled ? [1] : []
    content {
      sid    = "LambdaDeploy"
      effect = "Allow"
      actions = [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
      ]
      resources = [
        aws_lambda_function.media_processor[0].arn,
        aws_lambda_function.media_db_writer[0].arn,
      ]
    }
  }

  # --- Downloads stack (desktop update mirror) ---

  dynamic "statement" {
    for_each = local.downloads_enabled ? [1] : []
    content {
      sid    = "S3Downloads"
      effect = "Allow"
      actions = [
        "s3:ListBucket",
        "s3:GetBucketLocation",
      ]
      resources = [aws_s3_bucket.downloads[0].arn]
    }
  }

  dynamic "statement" {
    for_each = local.downloads_enabled ? [1] : []
    content {
      sid    = "S3DownloadsObjects"
      effect = "Allow"
      actions = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
      ]
      resources = ["${aws_s3_bucket.downloads[0].arn}/*"]
    }
  }

  dynamic "statement" {
    for_each = local.downloads_enabled ? [1] : []
    content {
      sid    = "S3ReleaseManifests"
      effect = "Allow"
      actions = [
        "s3:ListBucket",
        "s3:GetBucketLocation",
      ]
      resources = [aws_s3_bucket.release_manifests[0].arn]
    }
  }

  dynamic "statement" {
    for_each = local.downloads_enabled ? [1] : []
    content {
      sid    = "S3ReleaseManifestsObjects"
      effect = "Allow"
      actions = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
      ]
      resources = ["${aws_s3_bucket.release_manifests[0].arn}/*"]
    }
  }

  dynamic "statement" {
    for_each = local.downloads_enabled ? [1] : []
    content {
      sid    = "CloudFrontInvalidateDownloads"
      effect = "Allow"
      actions = [
        "cloudfront:CreateInvalidation",
      ]
      resources = [aws_cloudfront_distribution.downloads[0].arn]
    }
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  count  = var.enable_github_actions_deploy_role ? 1 : 0
  name   = "deploy"
  role   = aws_iam_role.github_actions_deploy[0].id
  policy = data.aws_iam_policy_document.github_actions_deploy[0].json
}
