terraform {
  required_version = ">= 1.5.0"

  required_providers {
    # nodejs24.x Lambda runtime requires AWS provider >= 6.21.0.
    # VPC module 6.x requires AWS provider >= 6.0.
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.21.0"
    }
    # 2.x is current; see https://registry.terraform.io/providers/mongodb/mongodbatlas/latest/docs/guides/2.0.0-upgrade-guide
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = ">= 2.0.0, < 3.0.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.9.0, < 1.0.0"
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

# CloudFront TLS certs and CLOUDFRONT-scoped WAF must use us-east-1 per AWS.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# MongoDB Atlas API (VPC peering). Keys can be set via atlas_api_* variables or
# MONGODB_ATLAS_PUBLIC_KEY / MONGODB_ATLAS_PRIVATE_KEY in the environment.
provider "mongodbatlas" {
  public_key  = var.atlas_api_public_key
  private_key = var.atlas_api_private_key
}
