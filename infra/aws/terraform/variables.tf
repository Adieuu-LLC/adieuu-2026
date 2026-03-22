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

variable "alb_ingress_cidr_blocks" {
  type        = list(string)
  description = "CIDR blocks allowed to reach the ALB on ports 80 and 443."
  default     = ["0.0.0.0/0"]
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

variable "api_environment" {
  type        = map(string)
  description = "Non-sensitive env for the API task. Keys and reserved names: docs/deployment/ecs-environment.md. Secrets use api_container_secrets."
  default     = {}
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
  default     = 512
}

variable "api_task_memory" {
  type        = number
  description = "Fargate memory (MiB) for the API task."
  default     = 1024
}

variable "chat_task_cpu" {
  type        = number
  description = "Fargate CPU units for the chat task."
  default     = 512
}

variable "chat_task_memory" {
  type        = number
  description = "Fargate memory (MiB) for the chat task."
  default     = 1024
}

variable "api_desired_count" {
  type        = number
  description = "Desired number of API tasks."
  default     = 1
}

variable "chat_desired_count" {
  type        = number
  description = "Desired number of chat tasks."
  default     = 1
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
