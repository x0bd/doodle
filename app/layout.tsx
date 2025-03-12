import type { Metadata } from "next";
import "./globals.css";
import { GeistMono } from "geist/font/mono";
import { MantineProvider } from "@mantine/core";

export const metadata: Metadata = {
	title: "Doodle",
	description: "A Simple AI Calculator",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${GeistMono.variable} font-mono  antialiased`}>
				<MantineProvider>{children}</MantineProvider>
			</body>
		</html>
	);
}
