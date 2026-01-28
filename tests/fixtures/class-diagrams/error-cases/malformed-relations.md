# Malformed Relations

```mermaid
classDiagram
    class Foo
    class Bar
    class Baz
    
    %% Valid relation
    Foo --> Bar
    
    %% Malformed relations (should be skipped)
    Foo -- (invalid syntax here)
    Bar ~~~> Baz
    
    %% Another valid relation
    Bar --> Baz
```
