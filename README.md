# Say it

A simple text-to-speech web app for listening to your words. Paste in some text, choose a voice, and press play.

## Why I made this

I wanted a way to turn text into speech so I could listen to things in the car. But many services aren't free, require you to create an account and share personal information, or make you buy credits. I just wanted a simple site where I could paste text and listen, so I made one with the help of AI.

I built it for my own use, but it's free for you to use too.

## Features

- Read up to 10,000 characters with voices provided by your browser and device.
- Use Amazon Polly's neural Joanna and Matthew voices for more natural-sounding speech, with a limit of 3,000 characters per request.
- Adjust speed; adjust pitch for device voices.
- Pause, resume, or stop playback.
- Run locally or deploy the site to AWS.

The app plays audio but does not currently export audio files. Available device voices depend on your browser and operating system. Some device voices may use a network service.

## Quick start: device voices

No AWS account or installation is required for device voices:

1. Open `site/index.html` in a browser that supports the Web Speech API.
2. Select a voice under **Device voices**. The default Matthew voice requires Polly, so it won't work by opening the file directly.
3. Enter text and select **Listen now**.

## Use Amazon Polly locally

Neural voices require an AWS account, the AWS CLI v2, Python 3, and credentials with `polly:SynthesizeSpeech` permission. AWS may charge for Polly requests; see [Costs and public access](#costs-and-public-access). Follow the [AWS CLI configuration guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html) to set up your credentials. Never commit credentials to your repository.

From the project directory:

```bash
# Optional if you use a named AWS CLI profile:
# export AWS_PROFILE=your-profile
python3 local_server.py --region us-east-1
```

Open [http://127.0.0.1:8099/](http://127.0.0.1:8099/), select Joanna or Matthew, and press **Listen now**. Keep the terminal open while using the app; press Ctrl+C to stop the server. Use `--port 8098` to choose another available port.

The server listens only on `127.0.0.1` and uses the AWS CLI credentials configured on your computer. A plain static server, such as `python3 -m http.server`, does not provide the Polly backend. If Polly fails, check the server terminal for AWS credential, region, or permission errors.

## Deploy to AWS

The included CloudFormation template creates a private S3 bucket, CloudFront distribution, API Gateway HTTP API, Lambda function, and an IAM role for Polly. The deployment script uploads the site and invalidates the CloudFront cache.

You'll need AWS CLI credentials with permission to create and update those resources, upload S3 objects, and create and wait for CloudFront invalidations. Use a region where the selected Polly neural voices are available; see [voice availability](https://docs.aws.amazon.com/polly/latest/dg/available-voices.html) and [region availability](https://docs.aws.amazon.com/polly/latest/dg/region-availability.html).

```bash
export AWS_REGION=us-east-1
# Optional: export AWS_PROFILE=your-profile
./deploy.sh
```

The script prints the HTTPS site URL after deployment and cache invalidation. The first deployment can take several minutes. Run it again after changing the site or infrastructure. Set `STACK_NAME` to use a name other than `say-it`. Uploads do not delete old objects from the bucket.

## Costs and public access

The source code is free to use, but **Amazon Polly and AWS hosting can incur charges**. Polly bills for synthesized characters, subject to your account's applicable free tier or credits; other AWS services and data transfer may also cost money. Check [Polly pricing](https://aws.amazon.com/polly/pricing/) and the pricing of the other AWS services before deploying.

**The deployed speech API is public and does not require sign-in. Anyone can call it at your expense**, including directly through the API Gateway endpoint. The template includes best-effort throttling, a concurrency limit, and a 3,000-character request limit, but these are **not a spending cap**. Configure AWS Budgets and billing alerts, monitor usage, and consider adding authentication and stronger usage controls before sharing a deployment widely. Alerts do not automatically stop charges.

## Privacy

Text used with a Polly voice is sent to AWS for synthesis. The local Polly server temporarily writes the text to a private local temporary directory for the AWS CLI and removes it when the request finishes. Avoid entering sensitive content unless you have reviewed the relevant data-handling policies. Google Fonts are requested from Google when available, with local font fallbacks.

## Cleanup

To remove a deployment, delete its CloudFormation stack. The S3 bucket is **intentionally retained**, including its contents. Record its name from the stack's `BucketName` output before deleting the stack, then separately empty and delete the bucket if you no longer need it. Retained storage and Lambda log groups can continue to incur charges.

## Project structure

```text
site/                 Browser app
local_server.py       Local server and AWS CLI Polly proxy
infrastructure.json   CloudFormation resources and Lambda code
deploy.sh             AWS deployment script
CHANGELOG.md          Release history
LICENSE               Apache License 2.0
```

## Contributing

Contributions and suggestions are welcome. If you publish a repository, contributors can propose changes using its issue and pull request tools.

## License

Licensed under the [Apache License 2.0](LICENSE).
