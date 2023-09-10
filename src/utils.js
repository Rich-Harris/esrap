/**
 * Does `array.push` for all `items`. Needed because `array.push(...items)` throws
 * "Maximum call stack size exceeded" when `items` is too big of an array.
 *
 * @param {any[]} array
 * @param {any[]} items
 */
export function push_array(array, items) {
	for (let i = 0; i < items.length; i++) {
		array.push(items[i]);
	}
}

// generate an ID that is, to all intents and purposes, unique
export const id = Math.round(Math.random() * 1e20).toString(36);
export const re = new RegExp(`_${id}_(?:(\\d+)|(AT)|(HASH))_(\\w+)?`, 'g');
