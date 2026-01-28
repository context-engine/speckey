import type { Annotations } from "./types";

export type EntityType = "definition" | "reference" | "external";

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

export class AnnotationParser {
    public parseAnnotations(comments: string[]): Annotations {
        const result: Annotations = {
            isValid: false,
            errors: [],
        };

        for (const comment of comments) {
            const cleanComment = comment.replace(/^%%/, "").trim();

            if (cleanComment.startsWith("@package")) {
                result.package = this.parsePackage(cleanComment);
                const validation = this.validatePackageName(result.package);
                if (!validation.valid) {
                    result.errors?.push(validation.error!);
                }
            }

            if (cleanComment.startsWith("@type")) {
                result.entityType = this.parseType(cleanComment);
                const validation = this.validateTypeName(result.entityType);
                if (!validation.valid) {
                    result.errors?.push(validation.error!);
                }
            }
        }

        // Validate required fields
        if (!result.package) {
            result.errors?.push("Missing required annotation: @package");
        }
        if (!result.entityType) {
            result.errors?.push("Missing required annotation: @type");
        }

        result.isValid = result.errors?.length === 0;
        return result;
    }

    public parsePackage(comment: string): string {
        return comment.replace(/^@package\s+/, "").trim();
    }

    public parseType(comment: string): EntityType | undefined {
        const typeStr = comment.replace(/^@type\s+/, "").trim();
        if (typeStr === "definition" || typeStr === "reference" || typeStr === "external") {
            return typeStr as EntityType;
        }
        return undefined; // Or handle invalid type string if needed by strictly returning EntityType or throwing
    }

    private validatePackageName(name: string): ValidationResult {
        // Dots allowed, no slashes, alphanumeric + underscore
        const regex = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/;
        if (regex.test(name)) {
            return { valid: true };
        }
        return { valid: false, error: `Invalid package name format: ${name}` };
    }

    private validateTypeName(name: EntityType | undefined): ValidationResult {
        if (!name) {
            return { valid: false, error: "Invalid entity type value" };
        }
        if (["definition", "reference", "external"].includes(name)) {
            return { valid: true };
        }
        return { valid: false, error: `Invalid entity type: ${name}` };
    }
}
