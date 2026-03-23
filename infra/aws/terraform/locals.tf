locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # True when var.route53_zone_name is set: enable ACM, Route53 records for api/app hostnames,
  # HTTPS on the ALB (and related resources such as CloudFront/WAF when defined in this stack).
  # False means the ALB is only addressed by its AWS DNS name over HTTP (no cert, no Route53 in Terraform).
  public_dns_tls_enabled = trimspace(var.route53_zone_name) != ""

  route53_zone_root = local.public_dns_tls_enabled ? trimsuffix(var.route53_zone_name, ".") : ""
  route53_zone_fqdn = local.public_dns_tls_enabled ? "${local.route53_zone_root}." : ""

  # Relative record names inside the public zone (e.g. api, app).
  api_route53_record_name = local.public_dns_tls_enabled ? replace(var.api_domain_name, ".${local.route53_zone_root}", "") : ""
  app_route53_record_name = local.public_dns_tls_enabled ? replace(var.app_domain_name, ".${local.route53_zone_root}", "") : ""

  # MongoDB Atlas API region format for network_container (e.g. US_EAST_1).
  atlas_region_name = upper(replace(var.aws_region, "-", "_"))

  # CloudFront: pay-as-you-go vs flat-rate plan (subscription is console/API; see variables.tf).
  cloudfront_flat_rate_enabled = var.cloudfront_pricing_model != "pay_as_you_go"

  # REGIONAL CDN WAF managed by Terraform. Flat-rate plans attach a CloudFront-managed WAF; do not create a second CLOUDFRONT-scoped ACL.
  cdn_waf_from_terraform = local.public_dns_tls_enabled && var.enable_waf && !local.cloudfront_flat_rate_enabled

  # Bare host IPs become /32 (IPv4) or /128 (IPv6) so AWS SG and WAF accept them.
  public_allowed_cidr_blocks_normalized = [
    for c in var.public_allowed_cidr_blocks : (
      strcontains(trimspace(c), "/") ? trimspace(c) : (
        strcontains(trimspace(c), ":") ? "${trimspace(c)}/128" : "${trimspace(c)}/32"
      )
    )
  ]

  # Split for ALB SG (IPv4) vs WAF IP sets (IPv4 + IPv6). IPv6-only allowlists are not supported for the ALB security group without VPC IPv6 / dualstack.
  public_allowed_cidr_blocks_v4 = [for c in local.public_allowed_cidr_blocks_normalized : c if !strcontains(c, ":")]
  public_allowed_cidr_blocks_v6 = [for c in local.public_allowed_cidr_blocks_normalized : c if strcontains(c, ":")]

  # Narrower than full-internet open (WAF adds block-if-not-in-allowlist when true).
  public_ingress_restricted = !(
    length(local.public_allowed_cidr_blocks_normalized) == 1 && (
      local.public_allowed_cidr_blocks_normalized[0] == "0.0.0.0/0" ||
      local.public_allowed_cidr_blocks_normalized[0] == "::/0"
    )
  )

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

  # IAM policy Resource ARNs for secretsmanager (strip ECS JSON-key suffix :key:: if present).
  # Use try(regex(...)[0]) instead of regexreplace for compatibility with older Terraform CLIs.
  secretsmanager_resource_arns = distinct([
    for v in values(merge(var.api_container_secrets, var.chat_container_secrets)) :
    try(regex("^(.+):[^:]+::$", v)[0], v)
  ])
}
