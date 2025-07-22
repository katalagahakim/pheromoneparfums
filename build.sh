#!/bin/bash
set -e

# Build the blog
cd blog
npx eleventy
cd ..
