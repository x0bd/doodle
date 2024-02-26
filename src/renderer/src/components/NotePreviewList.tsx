import { notesMock } from "@/store/mocks";
import { ComponentProps } from "react";

export default function NotePreviewList({ ...props }: ComponentProps<"ul">) {
	return (
		<ul>
			{notesMock.map((note) => (
				<li className="p-2" key={note.title}>
					{note.title}
				</li>
			))}
		</ul>
	);
}
