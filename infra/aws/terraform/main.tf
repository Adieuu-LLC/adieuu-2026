data "aws_caller_identity" "current" {}

# After /32 or /128 normalization in locals, every entry must be a valid CIDR.
check "public_allowed_cidr_syntax" {
  assert {
    condition = alltrue([
      for c in local.public_allowed_cidr_blocks_normalized : can(cidrnetmask(c))
    ])
    error_message = "Each entry must be a valid IPv4/IPv6 address or CIDR (e.g. 203.0.113.10, 203.0.113.0/24, 2001:db8::/32)."
  }
}

# ALB security group uses IPv4 CIDRs only; IPv6-only lists cannot be expressed on the ALB SG in this stack.
check "public_allowlist_has_ipv4_for_alb_sg" {
  assert {
    condition = (
      length(local.public_allowed_cidr_blocks_v4) > 0 ||
      length(local.public_allowed_cidr_blocks_v6) == 0
    )
    error_message = "public_allowed_cidr_blocks must include at least one IPv4 CIDR (e.g. 203.0.113.10/32) whenever IPv6 CIDRs are present, so the ALB security group can allow TCP 80/443. IPv6-only lists are not supported for the ALB SG; use IPv4 CIDRs (and WAF still applies IPv6 entries when present)."
  }
}

data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}
