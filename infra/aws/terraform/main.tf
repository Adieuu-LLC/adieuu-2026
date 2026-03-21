# Bootstrap: validates AWS credentials and pins default tags via provider.
# Add modules here (VPC, ECS, ALB, etc.) as the stack grows.

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  az_names = slice(
    data.aws_availability_zones.available.names,
    0,
    var.availability_zone_count
  )
}
