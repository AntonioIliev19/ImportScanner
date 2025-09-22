import { RefKind } from "../models/RefKind";

export interface Ref {
  file: string;
  kind: RefKind;
  from: string;
  detail?: string;
  pos: { line: number; col: number };
}
