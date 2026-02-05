#!/usr/bin/env bun
import { CLI } from "./cli";

const cli = new CLI();
const exitCode = await cli.run(process.argv.slice(2));
process.exit(exitCode);
