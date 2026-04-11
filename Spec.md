# Terminal natural-language command assistant: full spec

## 1. Goal

> Ever pull out Google or Claude for a simple thing that you just can't remember the command of? Ever receive a full essay when you just need one line? Try this

Build a terminal utility that converts short natural-language instructions into shell commands with **very low latency**, while preserving **clear trust boundaries**.

Primary UX target:

```text
$ a
> check what program is using port 8080
[T0] Risk: Safe  Provenance: Owner Reviewed
Running: lsof -i :8080
<runs immediately>
```

or:

```text
$ a
> add user to docker group
[T1] Risk: Mutating  Provenance: Owner Reviewed
sudo usermod -aG docker <user>
<user>: (editable buffer)
<inserted into shell, waiting for Enter>
```

or (for the sake of example):

```text
$ a
> find and kill process using port 8080
[T3] Risk: UNKNOWN  Provenance: LLM GENERATED
--------------------------------------------------
 WARNING: LLM Generated, review before proceeding
--------------------------------------------------
sudo lsof -t -i :8080 | xargs kill (Editable Preview Buffer)
--------------------------------------------------
(If no edit is made)
Accept Generated Command? [Y/N]
(If yes) <inserting into shell>
(If no)
Revise Prompt? [Y/n]
(If yes) <open prompt in editable buffer, repeat from start>
(If no) <exit>
```

The system should be:

- fast for common tasks
- deterministic when possible
- auditable
- explicit about provenance
- safe against trust creep

## 2. Non-goals

This tool is **not**:

- a general shell agent
- a background autonomous executor
- a chatbot
- a replacement for shell knowledge
- a system that silently learns from users

It should never:

- mutate trust state automatically
- execute untrusted synthesis without user friction
- pretend reviewed and generated commands are equivalent

---

## 3. Core Concepts (primer)

**Prompt** or **Instruction**: Interchangably refers to user provided prompt.

**Template**: A **template** refers to a command completion template. Itself is indexed by **intents** and contains a shell command template, a **risk classification**, a **provenance** classification, and a 'depends_on' for the executable that it needs.

**Intent**: refers to a standardized "things to do" such as 'check port', 'check systemd service status', 'search file', or 'copy file to remote server'

**DB**, **Database**: refers to a database of **templates**, indexed by **intents**

**LM** or **Intent classifier**: refers to a small AI model (sub-1B class, thus LM) that runs locally and maps user prompt to a **Template** in **DB**

**LLM**: differs from **LM**, when used in this document, exclusively refers to large models too heavy to run locally

**Environment Index**: a generated index containing information about OS, Shell, User, and Commands available. Updated on installation, on timeout (30d by default), or manually.

## 4. Trust Model

Every command have 2 properities: Risk Class and Provenance
An Execution policy tier is assigned based on these 2 properities

### 4.1 User consent

On installation, user need to consent to the following

- User need to trust the Owner of this repo, including the mistake they can make, the reviewer they entrusted with, and their mistakes.
- (Optional) Allow some audited commands to be executed immediately
- (Optional) Link a LLM provider such that when the local program can't find a solution, it will (allow/deny/ask) upload the prompt and information about (OS, Shell, Available Commands, and current Username) to a user-selected provider (by providing OAI endpoint and token (opt))
- (Optional) Upload LLM generated templates and edited command to help the community

### 4.2 Risk Classification

Risk is classified ON THE ASSUMPTION that user is trusted and do not enter malformed string into fields.

- **Safe**: commands that can't
    - Change anything (read-only)
    - Make network requests
    - Produce large amount of input
    - Hang the Shell
    - Can't be set when PR or updating DB, an explicit commit audit is required
- **Semi-Safe**: Commands that can't modify local file, which includes
    - curl: Which may have external side effect but is locally safe
    - find: May hang the shell or outputs large amount of text
- **Mutating**: Commands that modify local environment
- **Privileged**: Any commands that includes a sudo
- **Destructive**: Commands that may harm the OS irrecolovably

> [warning]
> Difference between Mutating and Destructive is blurred. As the line between write to a file and overwrote a file. While Destructive class requires additional caution it by no means implies mutating commands is safe, they are just like the difference between 10kV and 110V, both can screw you up.

### 4.3 Provenance Classification

Provenance refers to the source of a command template and how much human review it has been through.

- **Owner Reviewed** or **Audited**: Reviewed by repo/fork owner, or a maintainer they entrusted. While this is the highest class available the user still have the ultimate say on what get ran on their system. This is the only tier that guarrantees a manual review.
- **Community Reviewed** or **reviewed**: Reviewed by a human, anyone. Any PR to DB with this classification will be reviewed by AI and become candidate for **Audited**
- **Unreviewed**: While unreviewed, someone trust it enough to run it. This exist to speed up response but by no means give any trust.
- **Generated**: This is the lowest trust class for the reason of "If you are doing something so rare nobody in this community have done, something is wrong". It is a fallback option and an indicator of something may be wrong. As this repo is in early developmental phase you may see this often but as it matures this classification should be increasingly rare.

### 4.4 Trust Tiers

There are **4 trust tiers** for runtime policy.

#### Tier 0 — immediate execution

UX:

- command is shown briefly
- executes immediately
- no confirmation

Requirements:

- Risk class: safe
- Provenance: audited

#### Tier 1 — likely safe command

UX:

- inserted into shell line buffer
- one Enter runs it

Requirements:

- Risk class: semi-safe, mutating, privileged
- Provenance: audited

#### Tier 2 — Non-audited, warning

Largest class, Gives warnings before executing

UX:

- yellow warning: This command is not audited
- Additional warning for
    - red warn IF Risk class is Destructive
    - orange warn IF Provenance is Unreviewed or below
- inserted into shell line buffer
- one Enter runs it

Requirements:

- Risk class: ANY
- Provenance: Reviewed or UnReviewed

#### Tier 3 — LLM-generated fallback

UX:

- red warning
- shown in editable buffer before insertion
- Multiple confirmation needed

As an example

```text
$ a
> find and kill process using port 8080
[T3] Risk: UNKNOWN  Provenance: LLM GENERATED
--------------------------------------------------
 WARNING: LLM Generated, review before proceeding
--------------------------------------------------
sudo lsof -t -i :8080 | xargs kill (Editable Preview Buffer)
--------------------------------------------------
(If no edit is made)
Accept Generated Command? [Y/N]
(If yes) <inserting into shell>
(If enabled) Saving Generated Template...
(If no)
Revise Prompt? [Y/n]
(If yes) <open prompt in editable buffer, repeat from start>
(If no) <exit>
```

- Risk class: N/A
- Provenance: Generated
- Additionally, **Generated** templates cannot have any risk class
- When command is inserted to shell, if user consents, the template (and edited command) with risk unknown and provenance unreviewed is uploaded

## 5. High-level architecture

### 5.1 Pipeline

```text
User instruction
    ↓
Fast parser / heuristics
    ↓
Small local model (intent + slots)
    ↓
Template DB
    ↓
If match:
    render template
    assign trust tier
Else:
    fallback larger model
```

## 5.2 Components

### 5.2A. Shell integration layer

Handles:

- hotkey / alias / widget
- prompt buffer insertion
- edit mode
- Enter gating
- warnings / color

### 5.2B. Input normalizer

Normalizes user instruction:

- trim spaces
- lowercase for matching
- preserve quoted tokens
- extract numbers, usernames, ports, service names

### 5.2C. Heuristics layer

Fast regex/pattern rules for obvious intents:

- `port 8080`
- `docker group`
- `what uses port`
- `who is listening on`
- `which process`
- `restart service X`

This avoids model invocation for trival cases.

### 5.2D. Small local model

Purpose:

- classify intent
- extract slots (if specified)
- assign confidence
- never emit shell directly in normal path

Output schema should be structured.

### 5.2E. Template matching/DB

Contains:

- intents
- aliases/examples
- slot definitions
- per-platform templates
- trust metadata
- risk metadata
- validation rules

### 5.2F. Fallback model

Larger model used when no template matches, confidence too low, or command unavailable for template specified.

Should receive:

- normalized instruction
- OS/shell info
- compact command availability context
- strict output schema

### 5.2G. Index Management

Manages:

- Environment Index
- Template DB

Periodically: Invoked when command is used, forked async process

- Update Environment Index
- Update Template DB
- If enabled, Upload Generated Template history (incremental)

## 6. Shell UX spec

### 6.1 Invocation modes

#### Mode 1: interactive prompt

```text
$ a
> check port 8080
```

#### Mode 2: one-shot

```bash
a "check port 8080"
```

#### Mode 3: widget binding

Example:

- press `Alt-a`
- mini prompt appears
- result lands in current command line

This is probably the best final UX.

### 6.2 Placeholder behavior

When slots are missing, use placeholders:

```bash
sudo usermod -aG docker <user>
<user>: editable buffer
```

Contents entered in buffer is inserted into slots. Done by templating in code

### 6.3. CLI command spec

#### 6.3.1 Main commands

```bash
a
a "check port 8080"
a --dry-run "check port 8080"
a --debug "add user to docker group"
a --refresh
a --list-intents
```

#### 6.3.2 Debug output

Example:

```text
> Check what program is using port
[DEBUG] Entered: Check what program is using port
[DEBUG] Normalized input: check what program is using port
[DEBUG] Heuristic: null
[DEBUG] LM.intent: check_port
[DEBUG] LM.confidence: 0.94
[DEBUG] LM.placeholders: {port: null}
[DEBUG] --- Templating ---
[DEBUG] Template: check_port
Risk: safe  Provenance: audited  Execution Tier: T0 Safe
lsof -i :<port>
port: 8080
[DEBUG] User Input: {port: "8080"}
[DEBUG] Rendered: lsof -i :8080
Executing: lsof -i :8080
```

## 7. Structured model I/O

### 7.1 Small-model output schema

The small model should emit JSON only:

```json
{
    "intent": "check_port",
    "slots": {
        "port": "8080"
    },
    "confidence": 0.94,
    "needs_fallback": false
}
```

If ambiguous:

```json
{
    "intent": null,
    "slots": {},
    "confidence": 0.31,
    "needs_fallback": true
}
```

The small model should **not** output bash in the normal path.

### 7.2 Fallback-model output schema

Fallback model may emit structured shell proposal:

```json
{
    "command": "lsof -i :8080",
    "explanation": "Show process using TCP/UDP port 8080.",
    "confidence": 0.76
}
```

For state-changing commands:

```json
{
    "command": "sudo usermod -aG docker alice",
    "explanation": "Add alice to the docker group.",
    "confidence": 0.83
}
```

## 8. Template database spec

### 8.1 Required fields

Each entry should include:

- `intent`
- `summary`
- `slots`
- `template_by_platform`
- `risk`
- `review_state`
- `depends_on`

### 8.2 Example entry

```yaml
intent: check_port
summary: Show what process is using a port
slots:
    - "port"
template_by_platform:
    linux: "lsof -i :{port}"
    macos: "lsof -i :{port}"
depends_on:
    linux:
        - "lsof"
    macos:
        - "lsof"
risk: read_only_local
review_state: owner_reviewed
```

Another:

```yaml
intent: add_user_to_group
summary: Add a user to group
slots:
    - "user"
    - "group"
template_by_platform:
    linux: "sudo usermod -aG {group} {user}"
depends_on:
    linux:
        - "sudo"
        - "usermod"
risk: privileged
review_state: owner_reviewed
```

### 8.3 Error Conditions

When uncertain, prefer **safe degradation**.

#### 8.4.1 No match

```text
No trusted template matched.
```

Generate suggestion available as Tier 3.

#### 8.4.2 Missing dependency

```text
Template matched, but required command 'lsof' is unavailable.
Alternative: ...
```

#### 8.4.3 Multiple Match

Prefer better confidence > better trust > better slot coverage

#### 8.4.4 Low/Mixed Confidence

For the sake of example

```
Templates Matched:
0. Generate New Command
1. add_user_to_group: sudo usermod -aG {group} {user}
2. add_user_to_docker_group: sudo usermod -aG docker {user}
Choose: 2
```

## 9. Environment Index Spec

### 9.1 PATH scan behavior

- iterate over PATH directories
- gather executable base names
- deduplicate
- classify system builtin vs custom binary
- store in cache

Cache file example:

```json
{
    "generated_at": 1775246000,
    "shell": "bash",
    "os": "linux",
    "commands": {
        "builtin": ["bash", "lsof", "ss", "usermod", "id", "groups"],
        "installed": ["docker", "git"]
    }
}
```
