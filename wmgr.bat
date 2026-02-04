@echo off
grain --dir . --include-dirs src src/cli/cli.gr -- %1 %2
