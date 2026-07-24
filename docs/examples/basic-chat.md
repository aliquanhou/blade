# Basic Chat Examples

## Simple Questions

```bash
blade "What is the capital of France?"
blade "Explain the difference between TCP and UDP"
blade "Write a haiku about programming"
```

## Code Generation

```bash
blade "Write a Python function to sort a list of dictionaries by a key"
blade "Create a React component for a searchable dropdown"
blade "Write a bash script to rename all .jpg files to .png in a directory"
```

## File Operations

```bash
blade "Read the contents of package.json"
blade "Create a new file called hello.py with a hello world function"
blade "Search for all TODO comments in the current directory"
```

## Code Analysis

```bash
blade "Review the main function in src/index.ts for potential issues"
blade "Find all unused imports in this project"
blade "Explain the architecture of this project based on the files"
```

## Using with Piped Input

```bash
cat package.json | blade "What dependencies does this project use?"
git diff HEAD~1 | blade "Summarize the changes in this diff"
