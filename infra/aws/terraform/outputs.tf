output "aws_account_id" {
  description = "Current AWS account ID."
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "Region used for this deployment."
  value       = data.aws_region.current.id
}

output "availability_zones" {
  description = "AZ names selected for this deployment."
  value       = local.az_names
}

output "vpc_id" {
  description = "VPC ID."
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (ECS tasks)."
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB)."
  value       = module.vpc.public_subnets
}

output "alb_dns_name" {
  description = "DNS name of the application load balancer. Point a CNAME to this or use Route53 alias."
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Route53 zone ID for the ALB (for alias records)."
  value       = aws_lb.main.zone_id
}

output "ecr_api_repository_url" {
  description = "Push API images here (docker tag && docker push)."
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_chat_repository_url" {
  description = "Push chat images here."
  value       = aws_ecr_repository.chat.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "public_dns_tls_enabled" {
  description = "True when route53_zone_name is set (see locals.public_dns_tls_enabled): ACM, Route53 for api/app, HTTPS on the ALB, and other public-hostname resources in this stack are active."
  value       = local.public_dns_tls_enabled
}

output "http_urls" {
  description = "Example URLs for health checks. Uses HTTPS and api_domain_name when public_dns_tls_enabled is true."
  value = local.public_dns_tls_enabled ? {
    api_health = "https://${var.api_domain_name}/api/health/live"
    chat_ready = "https://${var.api_domain_name}/ready"
    chat_ws    = "wss://${var.api_domain_name}/ws/"
    } : {
    api_health = "http://${aws_lb.main.dns_name}/api/health/live"
    chat_ready = "http://${aws_lb.main.dns_name}/ready"
    chat_ws    = "ws://${aws_lb.main.dns_name}/ws/"
  }
}

output "acm_alb_certificate_arn" {
  description = "Issued regional ACM certificate for the API hostname (ALB) when public_dns_tls_enabled is true; null otherwise."
  value       = local.public_dns_tls_enabled ? aws_acm_certificate.alb[0].arn : null
}

output "acm_cloudfront_certificate_arn" {
  description = "Issued ACM certificate for the app hostname (CloudFront, us-east-1) when public_dns_tls_enabled is true; null otherwise."
  value       = local.public_dns_tls_enabled ? aws_acm_certificate.cloudfront[0].arn : null
}

output "app_domain_name" {
  description = "Configured app FQDN when public_dns_tls_enabled is true; null otherwise."
  value       = local.public_dns_tls_enabled ? var.app_domain_name : null
}

output "api_domain_name" {
  description = "Configured API FQDN when public_dns_tls_enabled is true; null otherwise."
  value       = local.public_dns_tls_enabled ? var.api_domain_name : null
}

output "elasticache_redis_primary_endpoint" {
  description = "Primary endpoint for ElastiCache Valkey (when create_elasticache_redis is true). REDIS_URL is also injected into ECS env."
  value       = var.create_elasticache_redis ? aws_elasticache_replication_group.redis[0].primary_endpoint_address : null
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID when public DNS/TLS is enabled; null otherwise."
  value       = local.public_dns_tls_enabled ? aws_cloudfront_distribution.web[0].id : null
}

output "web_s3_bucket_name" {
  description = "S3 bucket for the Vite web build when public DNS/TLS is enabled; null otherwise."
  value       = local.public_dns_tls_enabled ? aws_s3_bucket.web[0].id : null
}

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC (set as repository secret AWS_DEPLOY_ROLE_ARN_ADIEUU). Null when enable_github_actions_deploy_role is false."
  value       = var.enable_github_actions_deploy_role ? aws_iam_role.github_actions_deploy[0].arn : null
}

output "ecs_service_api_name" {
  description = "ECS service name for the API (for deploy workflows)."
  value       = aws_ecs_service.api.name
}

output "ecs_service_chat_name" {
  description = "ECS service name for chat (for deploy workflows)."
  value       = aws_ecs_service.chat.name
}

output "downloads_s3_bucket_name" {
  description = "S3 bucket for desktop binaries and SBOMs when downloads stack is enabled; null otherwise."
  value       = local.downloads_enabled ? aws_s3_bucket.downloads[0].id : null
}

output "release_manifests_s3_bucket_name" {
  description = "Private S3 bucket for release manifests (latest*.yml) when downloads stack is enabled; null otherwise."
  value       = local.downloads_enabled ? aws_s3_bucket.release_manifests[0].id : null
}

output "downloads_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for the downloads mirror when downloads stack is enabled; null otherwise."
  value       = local.downloads_enabled ? aws_cloudfront_distribution.downloads[0].id : null
}

output "downloads_base_url" {
  description = "Base URL for the downloads mirror (https://downloads.<domain>) when downloads stack is enabled; null otherwise."
  value       = local.downloads_enabled ? "https://${var.downloads_domain_name}" : null
}

output "media_s3_bucket_name" {
  description = "S3 bucket for user-uploaded media when media stack is enabled; null otherwise."
  value       = local.media_enabled ? aws_s3_bucket.media[0].id : null
}

output "media_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for the media CDN when media stack is enabled; null otherwise."
  value       = local.media_enabled ? aws_cloudfront_distribution.media[0].id : null
}

output "media_cdn_url" {
  description = "Base URL for the media CDN (https://media.<domain>) when media stack is enabled; null otherwise."
  value       = local.media_enabled ? "https://${var.media_domain_name}" : null
}

output "lambda_name_prefix" {
  description = "Name prefix for Lambda functions (project-environment). Set as DEPLOY_LAMBDA_NAME_PREFIX_ADIEUU in GitHub repo variables for CI deploy."
  value       = local.media_enabled ? local.name_prefix : null
}

output "media_processor_lambda_name" {
  description = "Lambda function name for the media processor when media stack is enabled; null otherwise."
  value       = local.media_enabled ? aws_lambda_function.media_processor[0].function_name : null
}

output "media_db_writer_lambda_name" {
  description = "Lambda function name for the media DB writer when media stack is enabled; null otherwise."
  value       = local.media_enabled ? aws_lambda_function.media_db_writer[0].function_name : null
}

output "e2e_media_s3_bucket_name" {
  description = "S3 bucket for E2E encrypted conversation media when media stack is enabled; null otherwise."
  value       = local.media_enabled ? aws_s3_bucket.e2e_media[0].id : null
}

output "cloudfront_pricing_model" {
  description = "Configured CloudFront pricing model (pay_as_you_go or flat_rate_*)."
  value       = var.cloudfront_pricing_model
}

output "cloudfront_flat_rate_instructions" {
  description = "Steps to subscribe to a flat-rate plan in the console; null when using pay_as_you_go or when CloudFront is not deployed."
  value = local.public_dns_tls_enabled && local.cloudfront_flat_rate_enabled ? join("\n", [
    "Terraform cannot subscribe to CloudFront flat-rate plans yet (AWS Pricing Plan Manager API). After apply:",
    "1. Open CloudFront → distribution ${aws_cloudfront_distribution.web[0].id} → Manage plan.",
    "2. Pick the tier matching cloudfront_pricing_model (e.g. flat_rate_free → Free in the console).",
    "3. Copy the distribution Web ACL ARN (often CreatedByCloudFront-...) into terraform.tfvars as cloudfront_pricing_plan_web_acl_arn and apply again so web_acl_id stays managed.",
  ]) : null
}

output "operational_alarms_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch operational alarms (confirm email subscription if alarm_notification_email is set)."
  value       = aws_sns_topic.operational.arn
}

output "mongodb_atlas_peering_enabled" {
  description = "True when Terraform created Atlas network container + VPC peering to this stack."
  value       = var.enable_mongodb_atlas_peering
}

output "mongodb_atlas_network_cidr" {
  description = "Atlas network container CIDR when peering is enabled (destination for private routes in this VPC)."
  value       = var.enable_mongodb_atlas_peering ? mongodbatlas_network_container.atlas[0].atlas_cidr_block : null
}

output "mongodb_atlas_vpc_peering_connection_id" {
  description = "AWS VPC peering connection ID between this VPC and Atlas (when peering is enabled)."
  value       = var.enable_mongodb_atlas_peering ? mongodbatlas_network_peering.atlas[0].connection_id : null
}

output "mongodb_atlas_peering_followup" {
  description = "Post-apply steps for the app and Atlas cluster (cluster must be M10+ or dedicated in the same region)."
  value = var.enable_mongodb_atlas_peering ? join("\n", [
    "1. In Atlas: confirm the cluster uses VPC peering (Network Access) and wait until peering status is ACTIVE.",
    "2. Copy the private connection string (SRV) for the cluster and set MONGODB_URI in Secrets Manager (or plain env) for API and chat tasks.",
    "3. Narrow Atlas IP access list: allow only this VPC CIDR (${var.vpc_cidr}) or remove open 0.0.0.0/0 once connectivity is verified.",
    "4. If a network container already existed in this project before Terraform, import mongodbatlas_network_container instead of creating a second one.",
  ]) : null
}
