import { Tag } from '../types';
export declare class TagModel {
    list(): Tag[];
    getById(id: number): Tag | undefined;
    create(name: string, color?: string): Tag;
    update(id: number, data: {
        name?: string;
        color?: string;
    }): Tag | undefined;
    delete(id: number): boolean;
    getTagsByAccountId(accountId: number): Tag[];
    getTagsByAccountIds(accountIds: number[]): Record<number, Tag[]>;
    setAccountTags(accountId: number, tagIds: number[]): void;
}
//# sourceMappingURL=Tag.d.ts.map