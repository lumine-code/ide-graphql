const personCard = graphql`
  query EmbeddedPerson($id: ID!) {
    person(id: $id) {
      name
      unknownEmbeddedField
    }
  }
`;

export default personCard;
