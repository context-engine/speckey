# Static and Abstract Members

```mermaid
classDiagram
    class Singleton {
        +String instance$
        +getInstance() Singleton$
        +reset()$
    }
    
    <<abstract>>
    class Shape {
        +draw()*
        +getArea() float*
        +getName() string
    }
    
    Singleton --> Shape
```
