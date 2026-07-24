## The main rule

A mature bug-finding system must separate:

1. **Detection** — “Something may be wrong.”
2. **Verification** — “The suspected condition is reachable and violates a requirement.”
3. **Confirmation** — “The defect produces an observable failure, or there is sufficiently strong proof that it can.”
4. **Remediation validation** — “The fix removes the defect without introducing regressions.”

A scanner alert, model opinion, code smell, suspicious pattern, or majority vote is **not a confirmed bug**.

There is no universal standard requiring exactly five or seven stages. ISO/IEC/IEEE 29119 defines generic testing processes and test-design techniques that organizations tailor to their lifecycle and risk. NIST’s SSDF similarly expects organizations to choose review and testing methods based on software stage and risk. ([ISO][1])

# Recommended industry-grade evidence ladder

Use six finding levels internally.

| Level | Status       | Meaning                                                             | May be shown to developer? | May block merge?        |
| ----- | ------------ | ------------------------------------------------------------------- | -------------------------- | ----------------------- |
| L0    | Raw signal   | Tool, heuristic, or model noticed something                         | No                         | No                      |
| L1    | Candidate    | Exact location and suspected violated rule identified               | Usually no                 | No                      |
| L2    | Plausible    | Relevant context examined; feasible failure hypothesis exists       | As advisory                | No                      |
| L3    | Reproducible | Test, trace, crash, failing assertion, or minimal reproducer exists | Yes                        | Usually yes             |
| L4    | Confirmed    | Root cause, trigger, effect, scope, and impact established          | Yes                        | Yes                     |
| L5    | Fix verified | Regression test passes and surrounding tests remain valid           | Close finding              | Required before closure |

For high-risk software, L4 may also be established through formal proof, model checking, sound static analysis, or a rigorous data/control-flow argument when runtime reproduction is impractical.

## Minimum requirements for “confirmed bug”

A finding should normally contain all of these:

* Exact source location and affected revision.
* Violated requirement, contract, invariant, specification, or documented expected behavior.
* Trigger conditions and required program state.
* Feasible control-flow and data-flow path.
* Expected result versus actual result.
* Observable consequence.
* Reproducer, failing test, trace, crash dump, or proof.
* Scope: configurations, platforms, versions and inputs affected.
* Root cause rather than only the visible symptom.
* Counterarguments examined.
* Regression test for the proposed fix.

Severity and confidence must remain separate:

```text
Confidence: How certain are we that this is a real defect?
Severity: How damaging is the defect if triggered?
```

A potentially catastrophic but unverified finding is **high severity, low confidence**, not “critical confirmed.”

# Recommended bug-analysis pipeline

## Phase 0 — Establish the test oracle

Before looking for bugs, define what “wrong” means.

Collect:

* Requirements and acceptance criteria.
* API contracts.
* Type and ownership rules.
* Architecture constraints.
* State-machine definitions.
* Protocol definitions.
* Error-handling requirements.
* Concurrency assumptions.
* Security properties.
* Relevant historical bugs.
* Supported platforms and configurations.

Without an oracle, an agent frequently reports unconventional but valid code as defective.

### Exit gate

The detector must be able to state:

```text
This behavior violates requirement/invariant X because Y.
```

If it cannot, classify the result as a smell, improvement, ambiguity, or missing specification—not a bug.

---

## Phase 1 — Broad signal generation

Use inexpensive, high-recall methods:

* Compiler warnings.
* Linters.
* Static analysis.
* Dependency and configuration scanning.
* Pattern matching.
* Changed-code analysis.
* Historical defect-pattern matching.
* LLM code inspection.
* Log anomaly detection.
* Existing test failures.

NIST recommends using code review and automated code analysis early, recording and triaging discovered issues, while retaining human review of tool reports. ([NIST Publications][2])

### Output

A hypothesis, not a conclusion:

```text
Potential out-of-bounds access at parser.c:144 when payload_length
is smaller than header_length.
```

### False-positive controls

* Analyze the actual build configuration.
* Use correct compiler flags and generated sources.
* Model frameworks and libraries accurately.
* Exclude unreachable test fixtures and dead platform branches where appropriate.
* Fingerprint and deduplicate equivalent reports.
* Do not attach severity solely from the detector’s rule name.

### Exit gate

Advance only when the finding has:

* A precise location.
* A named defect category.
* A proposed failure mechanism.
* At least one potentially feasible path.

CWE is useful for normalized weakness classification, while SARIF is the standard interchange format for combining static-analysis results from multiple tools. ([CWE][3])

---

## Phase 2 — Context reconstruction

Many false positives happen because only one function or file was inspected.

Retrieve and examine:

* Callers and callees.
* Type definitions.
* Constructors and initializers.
* Validation performed upstream.
* Error handling downstream.
* Configuration and feature flags.
* Build-time conditions.
* Threading and ownership model.
* Protocol schema.
* Tests covering the path.
* Recent commits and blame history.
* Generated code and external contracts.

### Core questions

1. Can the suspicious value actually reach this statement?
2. Has it already been validated?
3. Is the path compiled and deployed?
4. Is the code protected by an invariant not visible locally?
5. Is the reported behavior intentional?
6. Is the detector assuming the wrong platform, type size, API contract, or concurrency model?

### Exit gate

Produce a complete causal hypothesis:

```text
Entry point → relevant state → missing/incorrect validation →
defective operation → externally visible effect
```

Incomplete context remains L1 or L2.

---

## Phase 3 — Adversarial verification

Use a separate verifier whose job is to **disprove** the candidate.

The verifier should search for:

* Dominating validation checks.
* Impossible input combinations.
* Unreachable branches.
* Sanitization or normalization.
* Ownership guarantees.
* Locks and synchronization.
* Exception handling.
* Type-system guarantees.
* Platform assumptions.
* Existing tests contradicting the hypothesis.
* Documentation showing intended behavior.

A second model saying “I agree” is weak evidence because models can share the same training biases and reasoning errors.

Better independence comes from different evidence types:

* Static analysis + executable test.
* LLM hypothesis + compiler/sanitizer.
* Symbolic execution + manual review.
* Log trace + source-level path analysis.
* Two independently implemented analyzers.
* Differential behavior against a trusted implementation.

### Exit gate

Record both:

```text
Evidence supporting the finding
Evidence opposing the finding
```

A judge should never see only the prosecution argument.

---

## Phase 4 — Executable confirmation

Attempt to demonstrate the failure.

Recommended methods, in approximate order:

1. Existing test reproduction.
2. Focused unit test.
3. Minimal reproducer.
4. Integration test.
5. Property-based test.
6. Sanitizer or runtime instrumentation.
7. Differential test.
8. Fuzzing.
9. Fault injection.
10. Stress and concurrency testing.
11. Hardware-in-the-loop or production-like simulation.

NIST SSDF explicitly recommends executable testing, dynamic vulnerability testing, regression tests for previously reported vulnerabilities, fuzzing for input handling, and penetration testing for high-risk scenarios. ([NIST Publications][2])

### Reproduction quality

A strong reproduction:

* Starts from a clean state.
* Uses a recorded revision and environment.
* Runs automatically.
* Fails consistently.
* Contains a meaningful assertion.
* Fails before the fix.
* Passes after the fix.
* Avoids unrelated dependencies.
* Demonstrates the claimed effect, not merely suspicious internal state.

For nondeterministic defects, record:

* Number of runs.
* Number of failures.
* Random seed.
* Scheduler or timing configuration.
* Hardware and operating-system details.
* Confidence interval where appropriate.

### Exit gate

A deterministic defect should normally reproduce at least twice from a clean environment. A concurrency defect may need statistical reproduction or trace-supported proof.

---

## Phase 5 — Root-cause and impact analysis

Do not stop at “test failed.”

Determine:

* Immediate cause.
* Contributing conditions.
* Earliest incorrect state.
* Why existing controls failed.
* Affected call paths.
* Affected versions.
* Whether the defect is newly introduced or pre-existing.
* Whether similar instances exist elsewhere.
* Security, safety, reliability and data-integrity consequences.
* Whether the defect is externally triggerable.

Useful techniques include:

* Program slicing.
* Backward and forward data-flow analysis.
* Control-flow analysis.
* State-transition reconstruction.
* Five-whys analysis.
* Fault-tree analysis.
* Change-impact analysis.
* Taint analysis.
* Happens-before analysis for concurrency.
* Boundary-value and equivalence-partition analysis.
* Cause-effect graphs.
* Decision tables.

ISO/IEC/IEEE 29119-4 provides standardized test-design techniques, while NIST recommends recording root causes and feeding lessons back into development processes. ([ISO][4])

### Exit gate

The explanation must distinguish:

```text
Trigger → root cause → propagation → symptom → impact
```

---

## Phase 6 — Fix design and verification

A proposed fix is not accepted merely because the original test passes.

Perform:

* Review of the changed invariant.
* Original reproducer.
* New regression test.
* Unit tests.
* Integration tests.
* Relevant static analysis.
* Boundary tests.
* Negative tests.
* Adjacent-path tests.
* Performance or timing tests where relevant.
* Mutation testing for critical regression tests.
* Full or risk-selected regression suite.

### Particularly important check

Verify that the fix did not merely hide the symptom:

```text
Bad: catch and ignore the exception.
Good: prevent the invalid state and preserve the required error behavior.
```

### Exit gate

Close only after:

* The reproducer fails on the vulnerable revision.
* It passes with the fix.
* Relevant regression tests pass.
* The root cause is addressed.
* Similar instances have been searched.
* The finding record contains permanent evidence.

---

## Phase 7 — Learning, suppression and calibration

Every disposition should become reusable data:

* True positive.
* False positive.
* Duplicate.
* Intended behavior.
* Unreachable code.
* Invalid environment assumptions.
* Tool-modeling limitation.
* Accepted risk.
* Fixed.
* Cannot reproduce.
* Insufficient evidence.

Suppressions should include:

```yaml
finding_fingerprint: ...
reason: ...
evidence: ...
owner: ...
introduced_at: ...
expires_at: ...
scope:
  file: ...
  rule: ...
  configuration: ...
```

Never create permanent global suppressions from one local false positive.

SARIF supports normalized storage of results, baselines, fingerprints and suppression information, making it appropriate for this evidence pipeline. ([OASIS][5])

# Which methods belong at which stage?

| Method                 | Best role                             | Common false-positive weakness                            |
| ---------------------- | ------------------------------------- | --------------------------------------------------------- |
| Linter                 | Cheap detection                       | Style or syntactic pattern mistaken for functional defect |
| Static analysis        | Detection and path reasoning          | Incomplete library, alias, build or environment modeling  |
| LLM review             | Hypothesis generation and explanation | Hallucinated contracts and missing distant context        |
| Unit testing           | Local confirmation                    | Unrealistic mocks or incomplete system state              |
| Integration testing    | Component interaction                 | Expensive setup and incomplete environment parity         |
| Property-based testing | Edge-case discovery                   | Incorrect or weak properties                              |
| Fuzzing                | Parser and state-machine exploration  | Crashes caused by invalid harness assumptions             |
| Symbolic execution     | Path feasibility                      | Path explosion and inaccurate environmental models        |
| Model checking         | Concurrency/protocol verification     | Wrong or oversimplified formal model                      |
| Differential testing   | Detect behavioral disagreement        | Neither implementation may be a valid oracle              |
| Sanitizers             | Memory, undefined behavior, races     | Environment differences and unsupported instrumentation   |
| Manual review          | Intent and architecture validation    | Reviewer bias and inconsistency                           |
| Production telemetry   | Real-world confirmation               | Correlation mistaken for causation                        |

No single technique is sufficient. Strong findings use **triangulation**.

# Design for your multi-model research agent

For the bug-research agent you described earlier, use specialized roles rather than agents casually discussing until they agree.

```text
1. Scope Agent
   Determines revision, build, requirements and affected subsystem.

2. Detector Agents
   Generate candidates using different methods or models.

3. Context Agent
   Retrieves callers, callees, types, tests, configuration and history.

4. Path Analyst
   Constructs the exact control/data-flow chain.

5. Skeptic Agent
   Attempts to prove the candidate false.

6. Reproduction Agent
   Creates and runs a focused test or other executable evidence.

7. Root-Cause Agent
   Explains trigger, propagation, symptom and scope.

8. Evidence Judge
   Assigns status solely from structured evidence.

9. Fix Validator
   Runs the reproducer and regression tests on the patch.
```

## Critical architecture rule

The judge should receive a structured evidence package rather than the agents’ conversational transcript:

```yaml
finding:
  location:
  revision:
  category:
  violated_invariant:
  trigger:
  feasible_path:
  expected_behavior:
  actual_behavior:
  reproducer:
  execution_result:
  supporting_evidence:
  opposing_evidence:
  assumptions:
  affected_scope:
  root_cause:
  confidence:
  severity:
  status:
```

## Recommended judge policy

```text
No reproducible evidence + no rigorous proof:
    maximum status = plausible

Executable reproduction with clear oracle:
    status = confirmed

Tool crash without demonstrated product failure:
    status = tool/harness failure

Two LLMs agree but no independent evidence:
    maximum status = candidate

High severity but incomplete context:
    escalate for verification; do not label confirmed

Unclear expected behavior:
    classify as specification ambiguity
```

# CI enforcement levels

Use different pipelines rather than running every analysis on every change.

### Tier A — Every edit or commit

Target: seconds to a few minutes.

* Compiler.
* Formatting.
* Changed-code linting.
* Fast static rules.
* Unit tests near changed code.
* Secret/configuration checks.

Only previously calibrated, high-precision rules should block.

### Tier B — Every pull request

Target: several minutes to perhaps tens of minutes.

* Wider static analysis.
* Changed-path semantic inspection.
* Integration tests.
* Property tests.
* Candidate contextual verification.
* Regression tests related to modified subsystems.

Block only L3/L4 findings or policy violations with deterministic evidence.

### Tier C — Nightly

* Full static analysis.
* Fuzzing.
* Sanitizers.
* Stress testing.
* Cross-platform builds.
* Differential testing.
* Multi-agent codebase analysis.

### Tier D — Release candidate

* Full regression.
* Production-like environment tests.
* Threat-based testing.
* Performance and resource tests.
* Fault injection.
* Manual review of high-risk changes.
* Review of all suppressions and accepted risks.

### Tier E — Continuous/post-release

* Crash and anomaly monitoring.
* Security telemetry.
* Customer-reported defect correlation.
* Canary comparison.
* Reproduction and regression-test creation for escaped defects.

# Metrics that actually reveal false-positive problems

Do not report only “number of bugs found.”

Track:

```text
Precision = confirmed findings / all reviewed findings

Recall = confirmed findings detected / all known confirmed defects

False-positive rate = false positives / all genuinely negative cases

Triage yield = actionable findings / findings sent to engineers

Escape rate = production defects / total confirmed defects

Reopen rate = supposedly fixed findings that return

Median verification time

Suppression rate and suppression age

Confidence calibration:
Of findings labelled 90% confidence, approximately how many are real?
```

Precision and false-positive rate are different. In a large repository with very few defects, even a detector with a seemingly low false-positive rate can generate mostly false alerts.

Evaluate on:

* Known vulnerable examples.
* Corresponding fixed/good examples.
* Real production repositories.
* Historical defects hidden from the detector.
* Negative cases specifically designed to resemble bugs.
* Multiple configurations and platforms.

NIST’s SARD contains programs with known attributes, vulnerable/fixed pairs, and dedicated false-positive and suppression test suites. NIST also cautions that results from small synthetic benchmarks may not reflect false-positive behavior on production software. ([NIST Publications][6])

# Practical starting thresholds

These are operational recommendations, not mandated standards:

* **Raw detector precision below 20%:** do not expose alerts directly to developers.
* **PR-blocking precision:** aim above 90–95%.
* **Security or safety release blocker:** require executable reproduction, formal evidence, or independent expert review.
* **LLM-only candidate:** never automatically block.
* **Suppression:** require owner, justification, fingerprint and expiry.
* **New rules:** run in observation mode before enforcement.
* **High-severity candidates:** prioritize verification rather than increasing their confidence automatically.
* **Existing baseline issues:** track separately from defects introduced by the current change.

The most important design principle is:

> **Optimize the broad detector for recall, but optimize the developer-facing and merge-blocking layer for precision.**

That allows aggressive bug discovery without destroying trust through false positives.

[1]: https://www.iso.org/standard/79428.html?utm_source=chatgpt.com "ISO/IEC/IEEE 29119-2:2021 - Software testing"
[2]: https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-218.pdf "Secure Software Development Framework (SSDF) Version 1.1: Recommendations for Mitigating the Risk of Software Vulnerabilities"
[3]: https://cwe.mitre.org/?utm_source=chatgpt.com "Common Weakness Enumeration: CWE"
[4]: https://www.iso.org/standard/79430.html?utm_source=chatgpt.com "ISO/IEC/IEEE 29119-4:2021 - Software testing"
[5]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html?utm_source=chatgpt.com "Static Analysis Results Interchange Format (SARIF) Version ..."
[6]: https://nvlpubs.nist.gov/nistpubs/ir/2025/NIST.IR.8561.pdf "The Software Assurance Reference Dataset (SARD)"
