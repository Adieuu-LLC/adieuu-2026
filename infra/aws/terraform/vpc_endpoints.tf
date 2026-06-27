# Private connectivity to AWS APIs (reduces NAT traffic for ECR pulls, logs, secrets, STS, KMS).

resource "aws_security_group" "vpc_endpoints" {
  count = var.enable_vpc_interface_endpoints ? 1 : 0

  name        = "${local.name_prefix}-vpc-endpoints"
  description = "HTTPS from ECS tasks to interface VPC endpoints"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "HTTPS from ECS tasks"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-vpc-endpoints" })
}

resource "aws_vpc_endpoint" "s3" {
  count = var.enable_vpc_interface_endpoints ? 1 : 0

  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-s3-gw" })
}

locals {
  interface_endpoint_services = var.enable_vpc_interface_endpoints ? toset([
    "ecr.api",
    "ecr.dkr",
    "logs",
    "secretsmanager",
    "sts",
    "kms",
  ]) : toset([])
}

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoint_services

  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-vpce-${replace(each.key, ".", "-")}" })
}
