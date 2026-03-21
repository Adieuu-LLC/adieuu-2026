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

output "http_urls" {
  description = "Example URLs (replace with your domain when using HTTPS/DNS)."
  value = {
    api_health = "http://${aws_lb.main.dns_name}/api/health/live"
    chat_ready = "http://${aws_lb.main.dns_name}/ready"
  }
}
