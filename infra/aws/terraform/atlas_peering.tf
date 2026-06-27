# MongoDB Atlas ↔ AWS VPC peering (private connectivity to Atlas clusters in the same region).
# Requires an Atlas M10+ cluster (or dedicated) with VPC peering; see docs/deployment/aws.md.

check "atlas_api_keys_when_peering" {
  assert {
    condition = !var.enable_mongodb_atlas_peering || (
      length(trimspace(var.atlas_api_public_key)) > 0 &&
      length(trimspace(var.atlas_api_private_key)) > 0
    )
    error_message = "When enable_mongodb_atlas_peering is true, set atlas_api_public_key and atlas_api_private_key (or MONGODB_ATLAS_PUBLIC_KEY / MONGODB_ATLAS_PRIVATE_KEY)."
  }
}

resource "mongodbatlas_network_container" "atlas" {
  count = var.enable_mongodb_atlas_peering ? 1 : 0

  project_id       = var.atlas_project_id
  atlas_cidr_block = var.atlas_network_cidr_block
  provider_name    = "AWS"
  region_name      = local.atlas_region_name
}

resource "mongodbatlas_network_peering" "atlas" {
  count = var.enable_mongodb_atlas_peering ? 1 : 0

  accepter_region_name   = var.aws_region
  project_id             = var.atlas_project_id
  container_id           = mongodbatlas_network_container.atlas[0].container_id
  provider_name          = "AWS"
  route_table_cidr_block = var.vpc_cidr
  vpc_id                 = module.vpc.vpc_id
  aws_account_id         = data.aws_caller_identity.current.account_id
}

resource "aws_vpc_peering_connection_accepter" "atlas" {
  count = var.enable_mongodb_atlas_peering ? 1 : 0

  vpc_peering_connection_id = mongodbatlas_network_peering.atlas[0].connection_id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-atlas-peering"
  })

  depends_on = [mongodbatlas_network_peering.atlas]
}

# EC2 may still report the peering as non-ACTIVE briefly after AcceptVpcPeeringConnection returns.
# ModifyVpcPeeringConnectionOptions requires ACTIVE; without this wait, apply can fail with
# OperationNotPermitted (e.g. while Atlas UI still shows "waiting for approval").
resource "time_sleep" "atlas_peering_active" {
  count = var.enable_mongodb_atlas_peering ? 1 : 0

  depends_on      = [aws_vpc_peering_connection_accepter.atlas]
  create_duration = "30s"
}

resource "aws_vpc_peering_connection_options" "atlas" {
  count = var.enable_mongodb_atlas_peering ? 1 : 0

  vpc_peering_connection_id = aws_vpc_peering_connection_accepter.atlas[0].id

  accepter {
    allow_remote_vpc_dns_resolution = true
  }

  depends_on = [time_sleep.atlas_peering_active]
}

resource "aws_route" "to_atlas" {
  for_each = var.enable_mongodb_atlas_peering ? toset(module.vpc.private_route_table_ids) : toset([])

  route_table_id            = each.value
  destination_cidr_block    = mongodbatlas_network_container.atlas[0].atlas_cidr_block
  vpc_peering_connection_id = mongodbatlas_network_peering.atlas[0].connection_id

  depends_on = [
    aws_vpc_peering_connection_accepter.atlas,
    time_sleep.atlas_peering_active,
    mongodbatlas_network_peering.atlas,
  ]
}
