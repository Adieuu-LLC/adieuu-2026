variable "aws_region" {
  type        = string
  description = "AWS region for all regional resources (e.g. us-east-1)."
}

variable "project_name" {
  type        = string
  description = "Short name used for resource naming and tags (e.g. adieuu)."
}

variable "environment" {
  type        = string
  description = "Deployment stage (e.g. staging, prod). Used in tags and names."
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR for the VPC. Must not overlap MongoDB Atlas peering CIDRs."
  default     = "10.42.0.0/16"
}

variable "availability_zone_count" {
  type        = number
  description = "Number of AZs to use (2 or 3 recommended for ALB/production patterns)."
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2 && var.availability_zone_count <= 3
    error_message = "Use 2 or 3 availability zones."
  }
}

variable "enable_nat_gateway" {
  type        = bool
  description = "If true, create a NAT gateway for private subnet egress (required for Fargate pulls unless using VPC endpoints only)."
  default     = true
}

variable "single_nat_gateway" {
  type        = bool
  description = "If true, use one NAT gateway for all AZs (cheaper; less HA). Ignored if enable_nat_gateway is false."
  default     = true
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days for ECS log groups."
  default     = 14
}

variable "enable_container_insights" {
  type        = bool
  description = "Enable ECS Container Insights on the cluster."
  default     = false
}

variable "public_allowed_cidr_blocks" {
  type        = list(string)
  description = <<-EOT
    IPv4 and/or IPv6 CIDRs allowed to reach public endpoints: ALB (80/443) via security group,
    same CIDRs enforced in WAF on the ALB and CloudFront when enable_waf is true (block requests
    whose source IP is not in these sets). Use ["0.0.0.0/0"] or ["::/0"] for open internet.
    You may use a bare IPv4 (e.g. 203.0.113.10) or bare IPv6 host address; Terraform appends /32 or /128.
    When restricting, include at least one IPv4 CIDR so the ALB security group can allow ingress
    (IPv6-only lists are not supported for the ALB SG in this stack). CI and AWS APIs are unaffected.
  EOT
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.public_allowed_cidr_blocks) > 0
    error_message = "public_allowed_cidr_blocks must contain at least one CIDR."
  }

  validation {
    condition = alltrue([
      for c in var.public_allowed_cidr_blocks : length(trimspace(c)) > 0
    ])
    error_message = "Each entry in public_allowed_cidr_blocks must be a non-empty string."
  }
}

variable "alb_idle_timeout_seconds" {
  type        = number
  description = "ALB idle timeout in seconds (max 4000). Use a higher value for WebSockets."
  default     = 3600
}

variable "node_env" {
  type        = string
  description = "NODE_ENV passed to API and chat containers (e.g. production)."
  default     = "production"
}

variable "api_max_request_body_bytes" {
  type        = number
  description = <<-EOT
    Maximum HTTP request body size in bytes for the API. Must match the default in packages/shared (DEFAULT_MAX_REQUEST_BODY_BYTES)
    when using the default. Injected as MAX_REQUEST_BODY_BYTES on the API task and
    used by the ALB WAF rule block-request-body-over-max (when enable_waf is true).
  EOT
  default     = 102400

  validation {
    condition     = var.api_max_request_body_bytes >= 8192 && var.api_max_request_body_bytes <= 16777216
    error_message = "Use 8192–16777216 bytes (8 KiB–16 MiB)."
  }
}

variable "api_environment" {
  type        = map(string)
  description = "Non-sensitive env for the API task. Keys and reserved names: docs/deployment/ecs-environment.md. Secrets use api_container_secrets."
  default     = {}
}

variable "cors_additional_origins" {
  type        = list(string)
  description = <<-EOT
    Extra browser origins merged into the API task CORS_ORIGINS (after splitting api_environment.CORS_ORIGINS
    if present, else defaulting to https://<app_domain_name> when route53_zone_name is set).
    Use for localhost, staging, or LAN URLs without editing the whole CORS_ORIGINS string.
  EOT
  default     = []
}

variable "chat_environment" {
  type        = map(string)
  description = "Non-sensitive env for the chat task. Keys and reserved names: docs/deployment/ecs-environment.md. Secrets use chat_container_secrets."
  default     = {}
}

variable "api_image_tag" {
  type        = string
  description = "Image tag for the API container (ECR)."
  default     = "latest"
}

variable "chat_image_tag" {
  type        = string
  description = "Image tag for the chat container (ECR)."
  default     = "latest"
}

variable "api_task_cpu" {
  type        = number
  description = "Fargate CPU units for the API task (e.g. 256, 512, 1024)."
  default     = 256
}

variable "api_task_memory" {
  type        = number
  description = "Fargate memory (MiB) for the API task."
  default     = 512
}

variable "chat_task_cpu" {
  type        = number
  description = "Fargate CPU units for the chat task."
  default     = 256
}

variable "chat_task_memory" {
  type        = number
  description = "Fargate memory (MiB) for the chat task."
  default     = 512
}

# --- ECS service autoscaling (API + chat) ---

variable "ecs_autoscaling_min_capacity" {
  type        = number
  description = "Minimum tasks per ECS service (API and chat)."
  default     = 1
}

variable "ecs_autoscaling_max_capacity" {
  type        = number
  description = "Maximum tasks per ECS service (API and chat)."
  default     = 3

  validation {
    condition     = var.ecs_autoscaling_max_capacity >= var.ecs_autoscaling_min_capacity
    error_message = "ecs_autoscaling_max_capacity must be >= ecs_autoscaling_min_capacity."
  }
}

variable "ecs_autoscaling_cpu_target" {
  type        = number
  description = "Target tracking average CPU percent for ECS services (both API and chat)."
  default     = 70

  validation {
    condition     = var.ecs_autoscaling_cpu_target > 0 && var.ecs_autoscaling_cpu_target <= 100
    error_message = "ecs_autoscaling_cpu_target must be between 1 and 100."
  }
}

variable "ecs_autoscaling_memory_target" {
  type        = number
  description = "Target tracking average memory percent for ECS services (both API and chat)."
  default     = 80

  validation {
    condition     = var.ecs_autoscaling_memory_target > 0 && var.ecs_autoscaling_memory_target <= 100
    error_message = "ecs_autoscaling_memory_target must be between 1 and 100."
  }
}

variable "api_desired_count" {
  type        = number
  description = "Initial desired API tasks; must stay within ecs autoscaling min/max. After apply, desired count is managed by autoscaling (Terraform ignores drift)."
  default     = 1

  validation {
    condition = (
      var.api_desired_count >= var.ecs_autoscaling_min_capacity &&
      var.api_desired_count <= var.ecs_autoscaling_max_capacity
    )
    error_message = "api_desired_count must be between ecs_autoscaling_min_capacity and ecs_autoscaling_max_capacity."
  }
}

variable "chat_desired_count" {
  type        = number
  description = "Initial desired chat tasks; must stay within ecs autoscaling min/max. After apply, desired count is managed by autoscaling (Terraform ignores drift)."
  default     = 1

  validation {
    condition = (
      var.chat_desired_count >= var.ecs_autoscaling_min_capacity &&
      var.chat_desired_count <= var.ecs_autoscaling_max_capacity
    )
    error_message = "chat_desired_count must be between ecs_autoscaling_min_capacity and ecs_autoscaling_max_capacity."
  }
}

# --- Secrets Manager (injected by ECS; values live in AWS, not in Terraform) ---

variable "api_container_secrets" {
  type        = map(string)
  description = "Map of container env name -> ECS valueFrom (Secrets Manager ARN). For JSON key secrets use :KeyName:: suffix, e.g. arn:...:secret:name-AbCdEf:MY_KEY::"
  default     = {}
}

variable "chat_container_secrets" {
  type        = map(string)
  description = "Same as api_container_secrets for the chat container."
  default     = {}
}

variable "secretsmanager_kms_key_arns" {
  type        = list(string)
  description = "KMS key ARNs for customer-managed keys used to encrypt Secrets Manager secrets (for ecs task execution role kms:Decrypt)."
  default     = []
}

# --- ElastiCache (Redis-compatible; required for the default production stack) ---

variable "create_elasticache_redis" {
  type        = bool
  description = "Create ElastiCache in private subnets and inject REDIS_URL for API and chat. Keep true for the supported deploy path. Set false only if you provide REDIS_URL yourself (e.g. external Redis) and omit duplicate injection."
  default     = true
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache node type (e.g. cache.t4g.micro, cache.t3.micro)."
  default     = "cache.t4g.micro"
}

variable "redis_engine_version" {
  type        = string
  description = "Valkey engine version for ElastiCache (default 8.2). Must exist in your region: aws elasticache describe-cache-engine-versions --engine valkey"
  default     = "8.2"
}

variable "redis_snapshot_retention_days" {
  type        = number
  description = "Number of days for Redis snapshot retention (0 disables automatic backups)."
  default     = 0
}

# --- Public DNS + TLS (optional) ---
# When route53_zone_name is non-empty, local.public_dns_tls_enabled is true: Terraform manages
# ACM certificates, Route53 records for api/app, HTTPS on the ALB, and (in this stack) CloudFront/WAF
# as configured. When empty, the ALB is reachable only via its *.elb.amazonaws.com name on HTTP.

variable "route53_zone_name" {
  type        = string
  description = "Name of the existing public Route 53 hosted zone (e.g. adieuu.com). Non-empty turns on public_dns_tls_enabled. Terraform only adds records it owns (ACM validation, api/app aliases); it does not change apex, MX, TXT, or other existing records."
  default     = ""
}

variable "api_domain_name" {
  type        = string
  description = "FQDN for the API (must sit under route53_zone_name). Used for ALB ACM DNS validation, api alias, and Host-based routing. WebSockets: wss://<this>/ws/..."
  default     = "api.adieuu.com"
}

variable "app_domain_name" {
  type        = string
  description = "FQDN for the web app (must sit under route53_zone_name). Used for CloudFront ACM (us-east-1), app alias, and CloudFront alternate domain name."
  default     = "app.adieuu.com"
}

variable "downloads_domain_name" {
  type        = string
  description = "FQDN for the desktop update mirror and public downloads (must sit under route53_zone_name). Used for CloudFront ACM (us-east-1), downloads alias, and CloudFront alternate domain name."
  default     = "downloads.adieuu.com"
}

variable "enable_downloads_stack" {
  type        = bool
  description = "Create S3 + CloudFront infrastructure for desktop update mirror and public downloads (downloads.<domain>). Requires route53_zone_name to be set (public_dns_tls_enabled)."
  default     = false

  validation {
    condition = (
      !var.enable_downloads_stack ||
      trimspace(var.route53_zone_name) != ""
    )
    error_message = "enable_downloads_stack requires route53_zone_name so DNS and TLS can be provisioned."
  }
}

variable "enable_waf" {
  type        = bool
  description = "When true and public_dns_tls_enabled is true, attach managed WAF web ACLs to the ALB and CloudFront distribution."
  default     = false
}

# CloudFront flat-rate pricing (subscription not yet in Terraform AWS provider — use console after apply).
variable "cloudfront_pricing_model" {
  type        = string
  description = <<-EOT
    CloudFront billing model. Use pay_as_you_go for standard per-request/GB pricing.
    Use flat_rate_* to opt into AWS flat-rate tiers (Free / Pro / Business / Premium): Terraform creates
    the distribution for PAYG first; you subscribe in the CloudFront console (Manage plan) because the
    Terraform provider cannot call the Pricing Plan Manager API yet (see terraform-provider-aws #45450).
    Flat-rate plans include a CloudFront-managed WAF — set enable_waf = false to avoid a duplicate CLOUDFRONT WAF, or keep enable_waf = true only for the ALB (regional ACL).
  EOT
  default     = "pay_as_you_go"

  validation {
    condition = contains([
      "pay_as_you_go",
      "flat_rate_free",
      "flat_rate_pro",
      "flat_rate_business",
      "flat_rate_premium",
    ], var.cloudfront_pricing_model)
    error_message = "cloudfront_pricing_model must be one of: pay_as_you_go, flat_rate_free, flat_rate_pro, flat_rate_business, flat_rate_premium."
  }

  validation {
    condition = (
      var.cloudfront_pricing_model == "pay_as_you_go" ||
      trimspace(var.route53_zone_name) != ""
    )
    error_message = "Flat-rate CloudFront pricing requires route53_zone_name so the distribution exists."
  }
}

variable "cloudfront_pricing_plan_web_acl_arn" {
  type        = string
  description = <<-EOT
    After subscribing this distribution to a flat-rate plan in the AWS console, set this to the Web ACL
    ARN shown on the distribution (often CreatedByCloudFront-...) so Terraform keeps web_acl_id in sync.
    Leave empty before subscribing; required after subscribe if you manage this stack with Terraform, or
    the next apply may remove the association.
  EOT
  default     = ""
}

# --- Media uploads (S3 + CloudFront + Lambda image processor) ---

variable "enable_media_stack" {
  type        = bool
  description = "Create S3 + CloudFront + Lambda infrastructure for user-uploaded media (avatars, banners, attachments). Requires route53_zone_name to be set (public_dns_tls_enabled)."
  default     = false

  validation {
    condition = (
      !var.enable_media_stack ||
      trimspace(var.route53_zone_name) != ""
    )
    error_message = "enable_media_stack requires route53_zone_name so DNS and TLS can be provisioned."
  }
}

variable "media_domain_name" {
  type        = string
  description = "FQDN for the media CDN (must sit under route53_zone_name). Used for CloudFront ACM (us-east-1), media alias, and CloudFront alternate domain name."
  default     = "media.adieuu.com"
}

variable "enable_media_content_moderation" {
  type        = bool
  description = "Enable Amazon Rekognition in the media stack: DetectModerationLabels (images), StartContentModeration + SNS completion Lambda (conv_scan MP4), plus IAM/SNS/topic resources."
  default     = true
}

variable "media_moderation_confidence_threshold" {
  type        = number
  description = "Minimum confidence percentage (0-100) for Rekognition moderation labels to trigger rejection."
  default     = 75

  validation {
    condition     = var.media_moderation_confidence_threshold >= 0 && var.media_moderation_confidence_threshold <= 100
    error_message = "media_moderation_confidence_threshold must be between 0 and 100."
  }
}

variable "allow_legacy_conv_scan_video_moderation" {
  type        = bool
  description = "When true (default), media-processor still runs Rekognition StartContentModeration for a single MP4 under uploads/conv_scan/{hash}/. Set false to require frame JPEG batches only after all clients migrate."
  default     = true
}

variable "media_video_completion_lambda_reserved_concurrency" {
  type        = number
  description = "Reserved concurrency for the Rekognition video moderation completion Lambda (isolates from account burst)."
  default     = 10

  validation {
    condition     = var.media_video_completion_lambda_reserved_concurrency >= 1 && var.media_video_completion_lambda_reserved_concurrency <= 1000
    error_message = "Use 1–1000 or lower to fit account limits."
  }
}

variable "media_db_mongodb_secret_arn" {
  type        = string
  description = "ARN of the Secrets Manager secret containing the MongoDB connection string for the media DB writer Lambda. Required when enable_media_stack is true."
  default     = ""

  validation {
    condition = (
      !var.enable_media_stack ||
      length(trimspace(var.media_db_mongodb_secret_arn)) > 0
    )
    error_message = "media_db_mongodb_secret_arn is required when enable_media_stack is true."
  }
}

variable "media_db_mongodb_db_name" {
  type        = string
  description = "MongoDB database name used by the media DB writer Lambda."
  default     = "adieuu"
}

variable "media_db_mongodb_secret_key" {
  type        = string
  description = "JSON key within the Secrets Manager secret that contains the MongoDB connection string. Set to match your secret's key/value structure."
  default     = "MONGODB_URI"
}

variable "media_db_mongodb_secret_kms_key_arn" {
  type        = string
  description = "Optional KMS key ARN if the media DB MongoDB secret is encrypted with a customer-managed key. Leave empty for aws/secretsmanager default key."
  default     = ""
}

# --- GitHub Actions deploy (OIDC) ---

variable "enable_github_actions_deploy_role" {
  type        = bool
  description = "Create IAM role for GitHub Actions (OIDC) to deploy web (S3+CloudFront) and containers (ECR push + ECS force-new-deployment)."
  default     = true
}

variable "github_actions_repository" {
  type        = string
  description = "GitHub repository allowed to assume the deploy role (org/repo). Must match the repo running workflows."
  default     = "Adieuu-LLC/adieuu-2026"
}

variable "github_oidc_provider_arn" {
  type        = string
  description = <<-EOT
    Optional IAM OIDC provider ARN for GitHub (token.actions.githubusercontent.com). If empty, Terraform creates the provider in this account.
    If the provider already exists (e.g. from another stack), set this to that ARN to avoid duplicate creation.
    If Terraform previously created the provider here and you set this to the same account's provider ARN, the plan will try to destroy the managed resource — run
    terraform state rm 'aws_iam_openid_connect_provider.github[0]' once so the real provider is no longer tracked (it stays in AWS).
  EOT
  default     = ""
}

# --- VPC endpoints + operational alarms ---

variable "enable_vpc_interface_endpoints" {
  type        = bool
  description = "Create interface VPC endpoints (ECR, Logs, Secrets Manager, STS, KMS) and an S3 gateway endpoint so private subnets can reach AWS APIs with less NAT dependency. At low traffic the per-endpoint-per-AZ cost (~$87/mo for 6 services x 2 AZs) exceeds NAT data processing savings."
  default     = false
}

variable "alarm_notification_email" {
  type        = string
  description = "Optional email address to subscribe to the operational alarms SNS topic (must confirm subscription)."
  default     = ""
  sensitive   = true
}

# --- MongoDB Atlas VPC peering (optional) ---

variable "enable_mongodb_atlas_peering" {
  type        = bool
  description = "Create Atlas network container + VPC peering to this VPC, accept peering in AWS, add private routes, enable DNS resolution. Cluster must be M10+ (or dedicated) in the same region; CIDR must not overlap var.vpc_cidr."
  default     = false

  validation {
    condition = (
      !var.enable_mongodb_atlas_peering || (
        length(trimspace(var.atlas_project_id)) > 0 &&
        length(trimspace(var.atlas_network_cidr_block)) > 0
      )
    )
    error_message = "When enable_mongodb_atlas_peering is true, set atlas_project_id and atlas_network_cidr_block (non-overlapping RFC1918 /24–/21)."
  }
}

variable "atlas_project_id" {
  type        = string
  description = "MongoDB Atlas project ID (cloud.mongodb.com → Project Settings)."
  default     = ""
}

variable "atlas_network_cidr_block" {
  type        = string
  description = "RFC1918 CIDR for the Atlas network container in this region (/24–/21). Must not overlap vpc_cidr. If a container already exists in the project, import it instead of changing this."
  default     = ""
}

variable "atlas_api_public_key" {
  type        = string
  description = "MongoDB Atlas programmatic API public key (Organization → Access Manager). Can use env MONGODB_ATLAS_PUBLIC_KEY instead."
  default     = ""
  sensitive   = true
}

variable "atlas_api_private_key" {
  type        = string
  description = "MongoDB Atlas programmatic API private key. Can use env MONGODB_ATLAS_PRIVATE_KEY instead."
  default     = ""
  sensitive   = true
}
