import {Ref} from "../interfaces/reference";

export type DependencyJSON = {
    projectRoot: string;
    files: Array<{
        file: string;
        imports: Array<{
            kind: Ref["kind"];
            specifier: string;
            category: "internal" | "external";
            resolved?: string;
            line: number;
            col: number;
        }>;
    }>;
    edges: {
        internal: Array<[string, string]>;
        external: Array<[string, string]>;
        unresolvedInternal: Array<[string, string]>;
    };
    stats: {
        fileCount: number;
        importCount: number;
        internalCount: number;
        externalCount: number;
        unresolvedInternalCount: number;
        packageFrequency: Record<string, number>;
    };
};