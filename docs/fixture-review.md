---
title: Review fixture
---

# CriticMarkup review fixture

This document exercises markdown-it-critic rendering.

## All five marks

Addition: {++added text++}.

Deletion: {--removed text--}.

Substitution: {~~old text~>new text~~}.

Highlight: {==highlighted text==}.

Comment: {>> a reviewer comment <<}.

## Empty marks (paragraph breaks)

{++

++}

{--

--}

## Comment over (hover)

A phrase with an overlaid comment: {==target==}{>> check this <<}.

## Marks adjacent to KaTeX

Inline math next to marks: {++$x^2$++} and $y$ {--$z$--}.

Block math adjacent:

{++ $$a+b$$ ++}

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

Mark beside inline math: {==important==} $E=mc^2$ {>> ok <<}.

## Marks inside fences (must stay literal)

```python
# CriticMarkup must NOT parse here
x = "{++ not a mark ++}"
y = "{-- not a mark --}"
z = "{~~ a ~> b ~~}"
w = "{== not a mark ==}"
v = "{>> not a comment <<}"
```

```js
const s = "{++ literal ++} {-- literal --}";
```

## Broken / unclosed marks (must show source, never blank)

Unclosed addition: {++ this is never closed

Unclosed deletion: {-- this is never closed

Unclosed highlight: {== this is never closed

Unclosed comment: {>> this is never closed

Malformed braces: {++a++} {--b--} {not a mark} and {>> stray <<

## Adjacent marks

{++a++}{--b--}{==c==}{>>d<<}

## Links with marks

Link with mark: [{++added++}](https://example.invalid/x) (should not crash).

## Obsidian %% comments (compat)

Inline comment: Before %%secret inline note%% after.

Block comment:

%%%%
This is a block comment.
It should render as a muted span/div.
%%%%

Adjacent: text %%a%% %%b%% end.

## HTML comments (must stay hidden)

Before <!-- hidden html comment --> after.

Block html comment:

<!-- 
hidden block
-->

After.

## Include demo

Included from sibling file (read-only in this view):

[target.md](target.md)
