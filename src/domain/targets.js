export function parseDayTargets(friend) {
    const fallback = friend.target_start_time || "08:40";
    if (!friend.notes || friend.notes.trim() === "") {
        return Array(7).fill(fallback);
    }
    try {
        const blocks = friend.notes.split("|");
        if (blocks.length === 7) {
            return blocks.map(t => (t && t.trim() !== "" && t !== "null") ? t : fallback);
        }
    } catch(e) {}
    return Array(7).fill(fallback);
}
