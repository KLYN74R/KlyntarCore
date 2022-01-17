provider "aws" {
  region =""
}

resource "aws_instance" "name" {
  ami=""
  tags = {
    "Name" = ""
  }
}