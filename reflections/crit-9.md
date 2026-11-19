# Crit 9 reflection

Completed after the scheduled session, since I'd missed it.

**Breakthrough.** I asked Claude to stop once live progress and the reveal were wired up, because what two open browsers actually do isn't something I can verify by reading a diff ([06f7d8a](https://github.com/comp4020-agentic-coding-studio/comp4020-final-nzuuu9/commit/06f7d8a619419aa0f88e73fe505cbf20e5884f8a)). Running it myself in two Chrome windows, I watched the submission count change in the second window the moment I submitted in the first, while its own unfinished choices stayed exactly as I'd left them. When both finished, both windows showed "Dinner nearby" accepted and "Coastal drive" needing discussion at once — recorded in [fe6918c](https://github.com/comp4020-agentic-coding-studio/comp4020-final-nzuuu9/commit/fe6918c7a543ef7b43ff9252c6de683826450e28). The unfinished form surviving mattered more to me than the count itself; resetting someone's half-made choices would have undermined the independence the app is meant to protect.

**What it changed.** I'm more willing now to treat "it compiles and reads right" as insufficient for anything live. Next time I build a live feature, I'll leave a second person's form half finished and check what happens when the first person submits.
