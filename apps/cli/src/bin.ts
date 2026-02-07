#!/usr/bin/env bun
import { ParsePipeline } from "@speckey/core";
import { CLI } from "./cli";

const cli = new CLI(new ParsePipeline());
const exitCode = await cli.run(process.argv.slice(2));
process.exit(exitCode);
