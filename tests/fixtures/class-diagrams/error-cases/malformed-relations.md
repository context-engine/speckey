# Malformed Relations

```mermaid
classDiagram
    class Foo
    class Bar
    class Baz

    %% Valid relations
    Foo --> Bar
    Bar --> Baz

    %% Plain link (no arrow)
    Foo -- Baz
```
