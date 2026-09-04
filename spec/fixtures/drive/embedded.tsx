const personCard = graphql`
  query EmbeddedPerson($id: ID!) {
    person(id: $id) {
      name
      unknownEmbeddedField
    }
  }
`;

export const view: JSX.Element = <section>{personCard}</section>;
