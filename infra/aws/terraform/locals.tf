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
}
