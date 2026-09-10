import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Jakbar Twogether</CardTitle>
          <CardDescription>
            Badminton community operations platform — coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Get notified</Button>
        </CardContent>
      </Card>
    </div>
  );
}
