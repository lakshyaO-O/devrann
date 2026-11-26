# DevRann problem-source compatibility

Research checked on 2026-11-16. Public availability alone is not treated as permission to copy or redistribute. Each imported record must retain a stable upstream ID, pinned source revision, license URL, attribution, and source URL.

## Approved for a limited pilot

| Source | Official repository / license | Attribution and redistribution | Statements, tests, editorials | Stable IDs and metadata |
|---|---|---|---|---|
| Exercism Python track | [exercism/python](https://github.com/exercism/python), [MIT license](https://github.com/exercism/python/blob/main/LICENSE) | MIT permits copying, modification, and redistribution provided the copyright and permission notice accompany the distributed material. Attribute the Exercism contributors and include the license. | Track instruction files and the exercise specifications are covered by the repository license. The separate [problem-specifications repository](https://github.com/exercism/problem-specifications), also MIT-licensed, contains canonical test data. No editorial corpus is included in the DevRann pilot; do not infer a right to copy community solutions or discussions. | Exercise slugs (for example `isogram`) and repository paths are stable identifiers. The repositories provide exercise instructions, canonical tests, and track metadata. DevRann stores immutable commit revisions and source paths. |
| Exercism problem specifications | [exercism/problem-specifications](https://github.com/exercism/problem-specifications), [MIT license](https://github.com/exercism/problem-specifications/blob/main/LICENSE) | Same MIT notice and attribution requirements; the upstream notice is retained in `data/licenses/`. | Canonical exercise data/tests can be redistributed under MIT. This repository does not establish a right to import separate editorials or solutions from other sites. | Exercise slug and canonical-data path are stable; canonical metadata includes tests and exercise descriptions. |

The initial manifest contains four small Exercism-derived exercises. Its statements are paraphrased, examples and test data are explicitly recorded, and records are pinned to immutable upstream revisions. This is an allowlisted pilot, not blanket approval of all Exercism material or user-submitted solutions.

## Evaluated, not approved for import

| Source | Official reference | Decision |
|---|---|---|
| Kattis problem archive | [Open Kattis](https://open.kattis.com/) | No blanket redistribution license was established for the archive. Individual problem packages may have different rights; require and record a compatible license for each package before import. |
| CSES Problem Set | [CSES](https://cses.fi/problemset/) | No explicit license granting redistribution of statements, tests, or editorials was established. Do not copy without written permission or a clear per-item license. |
| Codeforces problems | [Codeforces](https://codeforces.com/) | Public problem pages do not by themselves establish redistribution rights. Do not scrape or republish statements, tests, or editorials. |
| Project Euler | [About Project Euler](https://projecteuler.net/about) | No redistribution license for the problem archive was established. Do not import its problem text or tests without permission. |
| USACO archive | [USACO](https://usaco.org/) | No blanket license covering redistribution of the problem archive was established. Require explicit permission or a per-problem compatible license. |

These are not legal determinations that the material can never be reused; they are ingestion gates. Re-evaluate only with authoritative license text or written permission.

## Original DevRann problems

Original problems are eligible when authored by DevRann or contributed under a written agreement that grants DevRann redistribution and derivative-work rights. Store author attribution, source/license metadata, and the same pinned tests and publication review as imported problems. Do not publish unverified submissions or treat generated content as original without provenance review.

## Pilot publication gate

`npm run problems:dry-run` validates the manifest without Firestore access. Any apply/publish operation is restricted by the importer to the local Firebase Emulator project `demo-devrann-p1`; production Firebase writes are rejected. The pilot manifest must pass metadata, deduplication, license, sample/hidden-test separation, and reference-solution checks before local publication. The current pipeline has not yet performed the end-to-end judge/reference-solution validation or a local emulator publish.
