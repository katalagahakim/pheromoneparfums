#!/bin/bash
set -e

# Build the blog
cd blog
npx eleventy
cd ..

# Deploy the worker
npx wrangler deploy
