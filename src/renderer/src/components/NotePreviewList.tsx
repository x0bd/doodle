import { notesMock } from "@/store/mocks";
import { ComponentProps } from "react";
import NotePreview from "./NotePreview";
import { twMerge } from "tailwind-merge";

export default function NotePreviewList({
	className,
	...props
}: ComponentProps<"ul">) {
	if (notesMock.length === 0) {
		return (
			<ul className={twMerge("text-center pt-4", className)} {...props}>
				<span>No Notes Yet!</span>
			</ul>
		);
	}

	return (
		<ul className={className} {...props}>
			{notesMock.map((note) => (
				<li className="p-2" key={note.title}>
					<NotePreview
						key={note.title + note.lastEditTime}
						{...note}
					/>
				</li>
			))}
		</ul>
	);
}
