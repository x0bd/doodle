import clsx, { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// I like this function
const dateFormatter = new Intl.DateTimeFormat(window.context.locale, {
	dateStyle: "short",
	timeStyle: "short",
	timeZone: "GMT",
});

export const formatDateFromMs = (ms: number) => dateFormatter.format(ms);

export const cn = (...args: ClassValue[]) => {
	return twMerge(clsx(...args));
};
