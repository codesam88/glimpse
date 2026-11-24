---
title: Fixture
---

# md-viewer fixture

This document exercises the offline renderer.

## KaTeX

Inline math: $E = mc^2$ and $\int_0^1 x^2 dx = 1/3$.

Block math:

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

## highlight.js

Python:

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

Rust:

```rust
fn main() {
    let v: Vec<i32> = (0..10).collect();
    println!("{:?}", v);
}
```

Bash:

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "hello $USER"
```

## Mermaid flowchart

```mermaid
flowchart TD
  A[Start] --> B{Decision}
  B -->|yes| C[Do thing]
  B -->|no| D[Skip]
  C --> E[End]
  D --> E
```

## Mermaid sequence

```mermaid
sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: Hello Bob
  B-->>A: Hi Alice
```

## Mermaid class

```mermaid
classDiagram
  class Animal {
    +name: string
    +eat(): void
  }
  class Dog {
    +bark(): void
  }
  Animal <|-- Dog
```

## Mermaid ER

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
```

## Mermaid state

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> Idle : stop
  Running --> [*] : done
```

## Mermaid gantt

```mermaid
gantt
  title A Gantt
  dateFormat YYYY-MM-DD
  section S1
  Task A :a1, 2026-01-01, 7d
  Task B :after a1, 5d
```

## Mermaid mindmap

```mermaid
mindmap
  root((md-viewer))
    diagrams
      mermaid
      plantuml
    math
      katex
```

## PlantUML sequence

```plantuml
@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi
@enduml
```

## PlantUML class

```plantuml
@startuml
class User {
  +name: String
  +login(): void
}
class Admin
User <|-- Admin
@enduml
```

## PlantUML activity

```plantuml
@startuml
start
:Hello;
if (cond?) then (yes)
  :Do yes;
else (no)
  :Do no;
endif
stop
@enduml
```

## PlantUML component

```plantuml
@startuml
component [Web UI]
component [Renderer]
[Web UI] --> [Renderer]
@enduml
```

## PlantUML state

```plantuml
@startuml
[*] --> Idle
Idle --> Active : start
Active --> [*] : stop
@enduml
```

## PlantUML dark toggle

Toggle the Dark button in the toolbar; diagrams re-render.

## PlantUML broken syntax

```plantuml
@startuml
this is not valid uml !!!
@enduml
```

## Graphviz dot

```dot
digraph G {
  rankdir=LR;
  a -> b -> c;
  a -> c;
}
```

## WaveDrom

```wavedrom
{ "signal": [
  { "name": "clk", "wave": "p......" },
  { "name": "data", "wave": "x.345x.", "data": ["a","b","c"] }
]}
```

## Nomnoml

```nomnoml
[Customer] -> [Order]
[Order] -> [LineItem]
```

## ditaa (deferred)

```ditaa
+--------+   +-------+
|        |-->|       |
|  A     |   |  B    |
+--------+   +-------+
```

## 100-node mermaid stress


```mermaid
flowchart LR
  n1[Node 1]
  n2[Node 2]
  n3[Node 3]
  n4[Node 4]
  n5[Node 5]
  n6[Node 6]
  n7[Node 7]
  n8[Node 8]
  n9[Node 9]
  n10[Node 10]
  n11[Node 11]
  n12[Node 12]
  n13[Node 13]
  n14[Node 14]
  n15[Node 15]
  n16[Node 16]
  n17[Node 17]
  n18[Node 18]
  n19[Node 19]
  n20[Node 20]
  n21[Node 21]
  n22[Node 22]
  n23[Node 23]
  n24[Node 24]
  n25[Node 25]
  n26[Node 26]
  n27[Node 27]
  n28[Node 28]
  n29[Node 29]
  n30[Node 30]
  n31[Node 31]
  n32[Node 32]
  n33[Node 33]
  n34[Node 34]
  n35[Node 35]
  n36[Node 36]
  n37[Node 37]
  n38[Node 38]
  n39[Node 39]
  n40[Node 40]
  n41[Node 41]
  n42[Node 42]
  n43[Node 43]
  n44[Node 44]
  n45[Node 45]
  n46[Node 46]
  n47[Node 47]
  n48[Node 48]
  n49[Node 49]
  n50[Node 50]
  n51[Node 51]
  n52[Node 52]
  n53[Node 53]
  n54[Node 54]
  n55[Node 55]
  n56[Node 56]
  n57[Node 57]
  n58[Node 58]
  n59[Node 59]
  n60[Node 60]
  n61[Node 61]
  n62[Node 62]
  n63[Node 63]
  n64[Node 64]
  n65[Node 65]
  n66[Node 66]
  n67[Node 67]
  n68[Node 68]
  n69[Node 69]
  n70[Node 70]
  n71[Node 71]
  n72[Node 72]
  n73[Node 73]
  n74[Node 74]
  n75[Node 75]
  n76[Node 76]
  n77[Node 77]
  n78[Node 78]
  n79[Node 79]
  n80[Node 80]
  n81[Node 81]
  n82[Node 82]
  n83[Node 83]
  n84[Node 84]
  n85[Node 85]
  n86[Node 86]
  n87[Node 87]
  n88[Node 88]
  n89[Node 89]
  n90[Node 90]
  n91[Node 91]
  n92[Node 92]
  n93[Node 93]
  n94[Node 94]
  n95[Node 95]
  n96[Node 96]
  n97[Node 97]
  n98[Node 98]
  n99[Node 99]
  n100[Node 100]
  n1 --> n2
  n2 --> n3
  n3 --> n4
  n4 --> n5
  n5 --> n6
  n6 --> n7
  n7 --> n8
  n8 --> n9
  n9 --> n10
  n10 --> n11
  n11 --> n12
  n12 --> n13
  n13 --> n14
  n14 --> n15
  n15 --> n16
  n16 --> n17
  n17 --> n18
  n18 --> n19
  n19 --> n20
  n20 --> n21
  n21 --> n22
  n22 --> n23
  n23 --> n24
  n24 --> n25
  n25 --> n26
  n26 --> n27
  n27 --> n28
  n28 --> n29
  n29 --> n30
  n30 --> n31
  n31 --> n32
  n32 --> n33
  n33 --> n34
  n34 --> n35
  n35 --> n36
  n36 --> n37
  n37 --> n38
  n38 --> n39
  n39 --> n40
  n40 --> n41
  n41 --> n42
  n42 --> n43
  n43 --> n44
  n44 --> n45
  n45 --> n46
  n46 --> n47
  n47 --> n48
  n48 --> n49
  n49 --> n50
  n50 --> n51
  n51 --> n52
  n52 --> n53
  n53 --> n54
  n54 --> n55
  n55 --> n56
  n56 --> n57
  n57 --> n58
  n58 --> n59
  n59 --> n60
  n60 --> n61
  n61 --> n62
  n62 --> n63
  n63 --> n64
  n64 --> n65
  n65 --> n66
  n66 --> n67
  n67 --> n68
  n68 --> n69
  n69 --> n70
  n70 --> n71
  n71 --> n72
  n72 --> n73
  n73 --> n74
  n74 --> n75
  n75 --> n76
  n76 --> n77
  n77 --> n78
  n78 --> n79
  n79 --> n80
  n80 --> n81
  n81 --> n82
  n82 --> n83
  n83 --> n84
  n84 --> n85
  n85 --> n86
  n86 --> n87
  n87 --> n88
  n88 --> n89
  n89 --> n90
  n90 --> n91
  n91 --> n92
  n92 --> n93
  n93 --> n94
  n94 --> n95
  n95 --> n96
  n96 --> n97
  n97 --> n98
  n98 --> n99
  n99 --> n100
  n1 --> n11
  n11 --> n21
  n21 --> n31
  n31 --> n41
  n41 --> n51
  n51 --> n61
  n61 --> n71
  n71 --> n81
  n81 --> n91
```

