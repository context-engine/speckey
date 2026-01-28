# Namespaced Classes

```mermaid
classDiagram
    namespace Domain {
        class User {
            +string name
        }
        class Order {
            +int total
        }
    }
    
    namespace Infrastructure {
        class Database
        class Cache
    }
    
    User --> Order
```
