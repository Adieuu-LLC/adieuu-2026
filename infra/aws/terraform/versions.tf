terraform {
  required_version = ">= 1.5.0"

  required_providers {
    # Pin to 5.x until terraform-aws-modules/vpc (and our root config) are clean on
    # provider 6.x (e.g. aws_region.name deprecation in module internals).
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0.0, < 6.0.0"
    }
  }

  # Uncomment and set after creating the bucket (recommended for teams):
  # backend "s3" {
  #   bucket         = "your-terraform-state-bucket"
  #   key            = "adieuu/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "your-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
