import { notesMock } from "@/store/mocks";
import { ComponentProps } from "react";
import NotePreview from "./NotePreview";

export default function NotePreviewList({ ...props }: ComponentProps<"ul">) {
	return (
		<ul>
			{notesMock.map((note) => (
				<li className="p-2" key={note.title}>
					<NotePreview key={note.title} {...note} />
				</li>
			))}
		</ul>
	);
}
