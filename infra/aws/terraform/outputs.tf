output "aws_account_id" {
  description = "Current AWS account ID (sanity check after terraform apply)."
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "Region used for this deployment."
  value       = data.aws_region.current.name
}

output "availability_zones" {
  description = "AZ names selected for this deployment."
  value       = local.az_names
}
