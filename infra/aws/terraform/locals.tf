locals {
  name_prefix = "${var.project_name}-${var.environment}"

  az_names = slice(
    data.aws_availability_zones.available.names,
    0,
    var.availability_zone_count
  )

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }

  private_subnet_cidrs = [
    for i in range(var.availability_zone_count) : cidrsubnet(var.vpc_cidr, 4, i)
  ]
  public_subnet_cidrs = [
    for i in range(var.availability_zone_count) : cidrsubnet(var.vpc_cidr, 4, i + var.availability_zone_count)
  ]

  # ALB / TG names max 32 characters
  alb_name     = substr("${local.name_prefix}-alb", 0, 32)
  tg_api_name  = substr("${local.name_prefix}-api", 0, 32)
  tg_chat_name = substr("${local.name_prefix}-chat", 0, 32)

  # Plain env maps (user tfvars last so they can override injected REDIS_URL)
  api_env_merged = merge(
    var.create_elasticache_redis ? {
      REDIS_URL = "redis://${aws_elasticache_replication_group.redis[0].primary_endpoint_address}:6379"
    } : {},
    var.api_environment
  )

  chat_env_merged = merge(
    var.create_elasticache_redis ? {
      REDIS_URL = "redis://${aws_elasticache_replication_group.redis[0].primary_endpoint_address}:6379"
    } : {},
    var.chat_environment
  )

  # Drop keys that the task definition sets explicitly so ECS env blocks do not duplicate names.
  api_env_for_task = {
    for k, v in local.api_env_merged : k => v
    if !contains(["PORT", "HOST", "NODE_ENV"], k)
  }

  chat_env_for_task = {
    for k, v in local.chat_env_merged : k => v
    if !contains(["CHAT_PORT", "CHAT_HOST", "NODE_ENV"], k)
  }

  # IAM policy Resource ARNs for secretsmanager (strip ECS JSON-key suffix :key:: if present)
  secretsmanager_resource_arns = distinct([
    for v in values(merge(var.api_container_secrets, var.chat_container_secrets)) :
    regexreplace(v, ":[^:]+::$", "")
  ])
}
