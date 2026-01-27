export const isValidHttpUrl = (input: string): boolean => {
    try {
        const parsed = new URL(input);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
};