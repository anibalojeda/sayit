#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?Set AWS_REGION to the region where the stack should be created}"
STACK_NAME="${STACK_NAME:-say-it}"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

command -v aws >/dev/null || { echo "AWS CLI is required." >&2; exit 1; }

aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$ROOT_DIR/infrastructure.json" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

output() {
  aws cloudformation describe-stacks \
    --region "$AWS_REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

BUCKET="$(output BucketName)"
DISTRIBUTION="$(output DistributionId)"
SITE_URL="$(output SiteUrl)"
if [[ -z "$BUCKET" || "$BUCKET" == "None" || -z "$DISTRIBUTION" || "$DISTRIBUTION" == "None" || -z "$SITE_URL" || "$SITE_URL" == "None" ]]; then
  echo "Required CloudFormation outputs are missing; deployment cannot continue." >&2
  exit 1
fi

aws s3 sync "$ROOT_DIR/site/" "s3://$BUCKET/" --region "$AWS_REGION"
INVALIDATION="$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths '/*' --query Invalidation.Id --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$INVALIDATION"
printf '\nSite URL: %s\nCloudFront cache invalidation completed.\n' "$SITE_URL"
