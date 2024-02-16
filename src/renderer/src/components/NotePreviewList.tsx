import { notesMock } from "@/store/mocks";

export default function NotePreviewList() {
	return (
		<ul>
			{notesMock.map((note) => (
				<li key={note.title}>{note.title}</li>
			))}
		</ul>
	);
}
