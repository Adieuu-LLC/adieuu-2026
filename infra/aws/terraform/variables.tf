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
